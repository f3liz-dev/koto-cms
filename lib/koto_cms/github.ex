defmodule KotoCms.GitHub do
  @base_url "https://api.github.com"

  def list_files(path \\ "", ref \\ nil) do
    repo = repo()
    branch = ref || default_branch()
    url = "#{@base_url}/repos/#{repo}/contents/#{path}?ref=#{branch}"

    case request(:get, url) do
      {:ok, data} when is_list(data) ->
        files = Enum.map(data, fn f ->
          %{
            path: f["path"],
            name: f["name"],
            type: if(f["type"] == "dir", do: "dir", else: "file"),
            sha: f["sha"]
          }
        end)
        |> Enum.sort_by(fn f -> {f.type != "dir", f.name} end)

        {:ok, files}

      error -> error
    end
  end

  def get_file(path, ref \\ nil) do
    repo = repo()
    branch = ref || default_branch()
    url = "#{@base_url}/repos/#{repo}/contents/#{path}?ref=#{branch}"

    case request(:get, url) do
      {:ok, data} ->
        content = data["content"] |> String.replace("\n", "") |> Base.decode64!()
        {:ok, %{path: data["path"], content: content, sha: data["sha"]}}

      error -> error
    end
  end

  def create_working_branch(fedi_handle) do
    repo = repo()
    branch_name = new_branch_name(fedi_handle)
    base_sha = get_latest_sha!(repo, default_branch())

    url = "#{@base_url}/repos/#{repo}/git/refs"
    body = %{ref: "refs/heads/#{branch_name}", sha: base_sha}

    case request(:post, url, body) do
      {:ok, _} -> {:ok, branch_name}
      error -> error
    end
  end

  def commit_file(path, content, sha, message, branch) do
    repo = repo()
    url = "#{@base_url}/repos/#{repo}/contents/#{path}"

    encoded = Base.encode64(content)
    body = %{message: message, content: encoded, branch: branch}
    body = if sha, do: Map.put(body, :sha, sha), else: body

    request(:put, url, body)
  end

  def delete_file(path, sha, message, branch) do
    repo = repo()
    url = "#{@base_url}/repos/#{repo}/contents/#{path}"
    body = %{message: message, sha: sha, branch: branch}

    request(:delete, url, body)
  end

  def list_user_prs(fedi_handle) do
    repo = repo()
    base = default_branch()
    slug = handle_slug(fedi_handle)
    prefix = "cms/#{slug}/"

    url = "#{@base_url}/repos/#{repo}/pulls?state=open&base=#{base}&per_page=50"

    with {:ok, prs} <- request(:get, url),
         {:ok, branches} <- get_branches(repo, prefix) do

      pr_map = Map.new(prs, fn pr -> {pr["head"]["ref"], pr} end)

      results = Enum.map(branches, fn branch ->
        pr = Map.get(pr_map, branch)
        %{
          branchName: branch,
          prNumber: pr && pr["number"],
          prUrl: pr && pr["html_url"],
          prState: cond do
            pr && pr["draft"] -> "draft"
            pr -> "open"
            true -> "none"
          end
        }
      end)
      |> Enum.sort_by(& &1.branchName, :desc)

      {:ok, results}
    end
  end

  def ensure_draft_pr(branch, fedi_handle) do
    case find_pr_for_branch(branch) do
      {:ok, pr} -> {:ok, %{prUrl: pr["html_url"], prNumber: pr["number"]}}
      {:error, :not_found} -> create_draft_pr(branch, fedi_handle)
    end
  end

  def mark_pr_ready(pr_number, title, body) do
    repo = repo()
    url = "#{@base_url}/repos/#{repo}/pulls/#{pr_number}"

    case request(:patch, url, %{title: title, body: body, draft: false}) do
      {:ok, data} -> {:ok, %{prUrl: data["html_url"], prNumber: data["number"]}}
      error -> error
    end
  end

  def get_preview_url(pr_number, config) do
    repo = repo()
    trusted_users = get_in(config, ["preview", "trustedUsers"]) || []
    url_patterns = get_in(config, ["preview", "urlPatterns"]) || []

    if Enum.empty?(trusted_users) or Enum.empty?(url_patterns) do
      {:ok, nil}
    else
      api_url = "#{@base_url}/repos/#{repo}/issues/#{pr_number}/comments?per_page=100"

      with {:ok, comments} <- request(:get, api_url) do
        preview_url =
          comments
          |> Enum.filter(fn comment ->
            Enum.any?(trusted_users, fn u -> u == comment["user"]["login"] end)
          end)
          |> Enum.flat_map(fn comment ->
            extract_urls(comment["body"] || "")
          end)
          |> Enum.find(fn url ->
            Enum.any?(url_patterns, fn pattern -> glob_match?(url, pattern) end)
          end)

        {:ok, preview_url}
      end
    end
  end

  def get_config(ref \\ nil) do
    case get_file(".koto.json", ref) do
      {:ok, %{content: content}} ->
        case Jason.decode(content) do
          {:ok, config} -> {:ok, config}
          _ -> {:ok, %{}}
        end
      _ -> {:ok, %{}}
    end
  end

  def list_tree(ref \\ nil) do
    repo = repo()
    branch = ref || default_branch()
    sha = get_latest_sha!(repo, branch)
    url = "#{@base_url}/repos/#{repo}/git/trees/#{sha}?recursive=1"

    case request(:get, url) do
      {:ok, %{"tree" => tree}} ->
        files =
          tree
          |> Enum.filter(fn item -> item["type"] == "blob" end)
          |> Enum.map(fn item ->
            name = item["path"] |> String.split("/") |> List.last()
            %{path: item["path"], name: name, type: "file", sha: item["sha"]}
          end)
        {:ok, files}
      error -> error
    end
  end

  def list_filtered_tree(config, ref \\ nil) do
    with {:ok, files} <- list_tree(ref) do
      include = Map.get(config, "include", [])
      exclude = Map.get(config, "exclude", [])
      include_patterns = if Enum.empty?(include), do: ["**"], else: include

      filtered =
        Enum.filter(files, fn f ->
          Enum.any?(include_patterns, &glob_match?(f.path, &1)) &&
            !Enum.any?(exclude, &glob_match?(f.path, &1))
        end)

      {:ok, filtered}
    end
  end

  def commit_message(action, path, author) do
    """
    content: #{action} #{path}

    Co-authored-by: #{author.name} <#{author.email}>
    Fediverse: `#{author.handle}`
    """
  end

  # Private

  defp request(method, url, body \\ nil) do
    headers = [
      {"Authorization", "Bearer #{token()}"},
      {"Accept", "application/vnd.github+json"},
      {"X-GitHub-Api-Version", "2022-11-28"},
      {"User-Agent", "koto-cms/1.0"}
    ]

    opts = [headers: headers]
    opts = if body, do: Keyword.put(opts, :json, body), else: opts

    case Req.request([method: method, url: url] ++ opts) do
      {:ok, %{status: status, body: body}} when status in 200..299 ->
        {:ok, body}

      {:ok, %{status: status, body: body}} ->
        {:error, "GitHub #{status}: #{inspect(body)}"}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp get_latest_sha!(repo, branch) do
    url = "#{@base_url}/repos/#{repo}/git/refs/heads/#{branch}"
    {:ok, data} = request(:get, url)
    data["object"]["sha"]
  end

  defp find_pr_for_branch(branch) do
    repo = repo()
    base = default_branch()
    [owner, _] = String.split(repo, "/")

    url = "#{@base_url}/repos/#{repo}/pulls?state=open&head=#{owner}:#{branch}&base=#{base}"

    case request(:get, url) do
      {:ok, [pr | _]} -> {:ok, pr}
      {:ok, []} -> {:error, :not_found}
      error -> error
    end
  end

  defp create_draft_pr(branch, fedi_handle) do
    repo = repo()
    base = default_branch()
    date = Date.utc_today() |> Date.to_iso8601()

    url = "#{@base_url}/repos/#{repo}/pulls"
    body = %{
      title: "[Draft] CMS edit by `#{fedi_handle}` on #{date}",
      body: "Draft PR created by Koto.\n\nAuthor: `#{fedi_handle}`\nDate: #{date}",
      head: branch,
      base: base,
      draft: true
    }

    case request(:post, url, body) do
      {:ok, data} ->
        add_label(repo, data["number"], "cms")
        {:ok, %{prUrl: data["html_url"], prNumber: data["number"]}}

      error -> error
    end
  end

  defp add_label(repo, pr_number, label) do
    url = "#{@base_url}/repos/#{repo}/issues/#{pr_number}/labels"
    request(:post, url, %{labels: [label]})
  end

  defp get_branches(repo, prefix) do
    url = "#{@base_url}/repos/#{repo}/git/matching-refs/heads/#{prefix}"

    case request(:get, url) do
      {:ok, refs} ->
        branches = Enum.map(refs, fn ref ->
          String.replace(ref["ref"], "refs/heads/", "")
        end)
        {:ok, branches}

      error -> error
    end
  end

  defp handle_slug(fedi_handle) do
    fedi_handle
    |> String.replace(~r/^@/, "")
    |> String.replace("@", "-")
    |> String.replace(".", "-")
  end

  defp new_branch_name(fedi_handle) do
    slug = handle_slug(fedi_handle)
    date = Date.utc_today() |> Date.to_iso8601()
    rand = :crypto.strong_rand_bytes(3) |> Base.encode16(case: :lower)
    "cms/#{slug}/#{date}-#{rand}"
  end

  defp extract_urls(text) do
    Regex.scan(~r/https?:\/\/[^\s<>"'\)\]]+/, text)
    |> Enum.map(&List.first/1)
  end

  defp glob_match?(path, pattern) do
    regex_str =
      pattern
      |> String.split("**")
      |> Enum.map(fn part ->
        part
        |> String.split("*")
        |> Enum.map(&Regex.escape/1)
        |> Enum.join("[^/]*")
        |> String.replace("\\?", "[^/]")
      end)
      |> Enum.join(".*")

    case Regex.compile("^#{regex_str}$") do
      {:ok, regex} -> Regex.match?(regex, path)
      _ -> false
    end
  end

  defp token, do: System.get_env("GITHUB_BOT_TOKEN") || raise "GITHUB_BOT_TOKEN required"
  defp repo, do: System.get_env("GITHUB_REPO") || raise "GITHUB_REPO required"
  defp default_branch, do: System.get_env("GITHUB_BRANCH") || "main"
end
