defmodule KotoCmsWeb.DiagnosticsController do
  use Phoenix.Controller

  def index(conn, _params) do
    json(conn, %{
      timestamp: DateTime.utc_now() |> DateTime.to_iso8601(),
      vault_mode: false,
      secrets_initialized: true,
      secrets_error: nil,
      env_vars: %{
        has_github_bot_token: !!System.get_env("GITHUB_BOT_TOKEN"),
        has_session_secret: !!System.get_env("SESSION_SECRET"),
        has_github_repo: !!System.get_env("GITHUB_REPO"),
        has_document_editors: !!System.get_env("DOCUMENT_EDITORS"),
        has_miauth_callback_url: !!System.get_env("MIAUTH_CALLBACK_URL"),
        has_frontend_url: !!System.get_env("FRONTEND_URL")
      }
    })
  end
end
