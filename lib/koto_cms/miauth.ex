defmodule KotoCms.MiAuth do
  alias KotoCms.Allowlist

  def initiate_flow(handle) do
    case validate_handle(handle) do
      {:ok, %{username: _username, instance: instance}} ->
        instance_url = "https://#{instance}"
        session_id = UUID.uuid4()
        callback_url = System.get_env("MIAUTH_CALLBACK_URL") || "http://localhost:3000/miauth/callback"
        app_name = System.get_env("APP_NAME") || "Koto"

        auth_url = "#{instance_url}/miauth/#{session_id}?name=#{URI.encode(app_name)}&callback=#{URI.encode(callback_url)}&permission=read:account"

        {:ok, %{sessionUrl: auth_url, sessionId: session_id}}

      {:error, reason} -> {:error, reason}
    end
  end

  def handle_callback(session_id, instance_url) do
    check_url = "#{instance_url}/api/miauth/#{session_id}/check"

    case Req.post(check_url, json: %{}) do
      {:ok, %{status: 200, body: body}} ->
        process_auth_response(body, instance_url)

      {:ok, %{status: status}} ->
        {:error, "MiAuth check failed: #{status}"}

      {:error, reason} ->
        {:error, "MiAuth error: #{inspect(reason)}"}
    end
  end

  defp process_auth_response(%{"user" => user} = data, instance_url) do
    mi_token = data["token"]
    instance = user["host"] || URI.parse(instance_url).host
    fedi_handle = "@#{user["username"]}@#{instance}"

    case Allowlist.validate(fedi_handle) do
      false ->
        {:error, "Editor #{fedi_handle} is not in the allowlist"}

      true ->
        display_name = fetch_display_name(user, instance_url, mi_token)
        github_token = System.get_env("GITHUB_BOT_TOKEN")

        if github_token do
          {:ok, %{
            ok: true,
            access_token: github_token,
            author_name: display_name,
            author_email: "#{user["username"]}+#{instance}@users.noreply.fediverse",
            fedi_handle: fedi_handle
          }}
        else
          {:error, "Bot GitHub token not configured"}
        end
    end
  end

  defp process_auth_response(_, _) do
    {:error, "User not authenticated"}
  end

  defp fetch_display_name(user, instance_url, mi_token) do
    profile_url = "#{instance_url}/api/users/show"
    body = %{username: user["username"], host: user["host"], i: mi_token}

    case Req.post(profile_url, json: body) do
      {:ok, %{status: 200, body: profile}} ->
        profile["name"] || user["name"] || user["username"]

      _ ->
        user["name"] || user["username"]
    end
  end

  defp validate_handle(handle) do
    normalized = String.replace_prefix(handle, "@", "")

    case String.split(normalized, "@") do
      [username, instance] when username != "" and instance != "" ->
        if String.contains?(instance, ".") or instance == "localhost" do
          {:ok, %{username: username, instance: instance}}
        else
          {:error, "Invalid instance domain"}
        end

      _ ->
        {:error, "Invalid handle format"}
    end
  end
end
