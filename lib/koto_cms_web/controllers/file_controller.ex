defmodule KotoCmsWeb.FileController do
  use Phoenix.Controller
  alias KotoCms.GitHub

  def config(conn, params) do
    ref = params["ref"]
    case GitHub.get_config(ref) do
      {:ok, cfg} -> json(conn, cfg)
      {:error, reason} -> conn |> put_status(500) |> json(%{error: reason})
    end
  end

  def tree(conn, params) do
    ref = params["ref"]
    with {:ok, cfg} <- GitHub.get_config(ref),
         {:ok, files} <- GitHub.list_filtered_tree(cfg, ref) do
      json(conn, files)
    else
      {:error, reason} -> conn |> put_status(500) |> json(%{error: reason})
    end
  end

  def list(conn, params) do
    path = params["path"] || ""
    ref = params["ref"]

    case GitHub.list_files(path, ref) do
      {:ok, files} -> json(conn, files)
      {:error, reason} ->
        json(conn, %{error: reason})
        |> put_status(500)
    end
  end

  def show(conn, %{"path" => path} = params) do
    ref = params["ref"]

    case GitHub.get_file(path, ref) do
      {:ok, file} -> json(conn, file)
      {:error, reason} ->
        json(conn, %{error: reason})
        |> put_status(500)
    end
  end

  def show(conn, _params) do
    json(conn, %{error: "Missing path"})
    |> put_status(400)
  end

  def update(conn, params) do
    session = conn.assigns.session
    path = params["path"]
    content = params["content"]
    sha = params["sha"]
    branch = params["branchName"]

    author = %{
      name: session.author_name,
      email: session[:custom_email] || session.author_email,
      handle: session.fedi_handle
    }

    action = if sha, do: "update", else: "create"
    message = GitHub.commit_message(action, path, author)

    case GitHub.commit_file(path, content, sha, message, branch) do
      {:ok, _} ->
        case GitHub.ensure_draft_pr(branch, session.fedi_handle) do
          {:ok, pr} ->
            json(conn, %{
              branchName: branch,
              prUrl: pr.prUrl,
              prNumber: pr.prNumber
            })

          {:error, reason} ->
            json(conn, %{error: reason})
            |> put_status(500)
        end

      {:error, reason} ->
        json(conn, %{error: reason})
        |> put_status(500)
    end
  end

  def delete(conn, %{"path" => path, "sha" => sha, "branch" => branch}) do
    session = conn.assigns.session

    author = %{
      name: session.author_name,
      email: session[:custom_email] || session.author_email,
      handle: session.fedi_handle
    }

    message = GitHub.commit_message("delete", path, author)

    case GitHub.delete_file(path, sha, message, branch) do
      {:ok, _} ->
        case GitHub.ensure_draft_pr(branch, session.fedi_handle) do
          {:ok, pr} ->
            json(conn, %{
              branchName: branch,
              prUrl: pr.prUrl,
              prNumber: pr.prNumber
            })

          {:error, reason} ->
            json(conn, %{error: reason})
            |> put_status(500)
        end

      {:error, reason} ->
        json(conn, %{error: reason})
        |> put_status(500)
    end
  end
end
