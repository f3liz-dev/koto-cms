defmodule KotoCmsWeb.HealthController do
  use Phoenix.Controller

  def index(conn, _params) do
    json(conn, %{
      ok: true,
      ts: DateTime.utc_now() |> DateTime.to_iso8601(),
      secrets: "initialized",
      vault_mode: false
    })
  end
end
