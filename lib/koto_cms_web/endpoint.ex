defmodule KotoCmsWeb.Endpoint do
  use Phoenix.Endpoint, otp_app: :koto_cms

  # Session configuration from environment
  @session_options [
    store: :cookie,
    key: System.get_env("SESSION_COOKIE_KEY") || "_koto_cms_key",
    signing_salt: System.get_env("SESSION_SIGNING_SALT") ||
                  raise("SESSION_SIGNING_SALT environment variable is required"),
    same_site: "Lax"
  ]

  plug Plug.Static,
    at: "/",
    from: :koto_cms,
    gzip: false,
    only: KotoCmsWeb.static_paths()

  plug Plug.RequestId
  plug Plug.Telemetry, event_prefix: [:phoenix, :endpoint]

  plug Plug.Parsers,
    parsers: [:urlencoded, :multipart, :json],
    pass: ["*/*"],
    json_decoder: Phoenix.json_library()

  plug Plug.MethodOverride
  plug Plug.Head
  plug Plug.Session, @session_options
  plug CORSPlug
  plug KotoCmsWeb.Router
end
