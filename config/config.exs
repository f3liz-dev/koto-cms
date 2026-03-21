import Config

config :koto_cms, KotoCmsWeb.Endpoint,
  url: [host: "localhost"],
  adapter: Bandit.PhoenixAdapter,
  render_errors: [
    formats: [json: KotoCmsWeb.ErrorJSON],
    layout: false
  ],
  pubsub_server: KotoCms.PubSub,
  live_view: [
    signing_salt: System.get_env("LIVEVIEW_SIGNING_SALT") || "dev_liveview_salt"
  ]

config :logger, :console,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id]

config :phoenix, :json_library, Jason

import_config "#{config_env()}.exs"
