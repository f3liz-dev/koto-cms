import Config

config :koto_cms, KotoCmsWeb.Endpoint,
  http: [ip: {0, 0, 0, 0}, port: {:system, "PORT"}],
  url: [host: {:system, "HOST"}, port: {:system, "PORT"}],
  cache_static_manifest: "priv/static/cache_manifest.json",
  server: true

config :logger, level: :info
