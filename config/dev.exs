import Config

config :koto_cms, KotoCmsWeb.Endpoint,
  http: [ip: {0, 0, 0, 0}, port: 3000],
  check_origin: false,
  code_reloader: true,
  debug_errors: true,
  secret_key_base: System.get_env("SECRET_KEY_BASE") ||
                   "dev_secret_key_base_at_least_64_bytes_long_for_development_only",
  watchers: []

config :logger, :console, format: "[$level] $message\n"
config :phoenix, :stacktrace_depth, 20
config :phoenix, :plug_init_mode, :runtime
