defmodule KotoCms.MixProject do
  use Mix.Project

  def project do
    [
      app: :koto_cms,
      version: "1.0.0",
      elixir: "~> 1.17",
      elixirc_paths: elixirc_paths(Mix.env()),
      start_permanent: Mix.env() == :prod,
      aliases: aliases(),
      deps: deps()
    ]
  end

  def application do
    [
      mod: {KotoCms.Application, []},
      extra_applications: [:logger, :runtime_tools]
    ]
  end

  defp elixirc_paths(:test), do: ["lib", "test/support"]
  defp elixirc_paths(_), do: ["lib"]

  defp deps do
    [
      {:phoenix, "~> 1.7.18"},
      {:bandit, "~> 1.0"},
      {:jason, "~> 1.4"},
      {:cors_plug, "~> 3.0"},
      {:joken, "~> 2.6"},
      {:req, "~> 0.5"},
      {:uuid, "~> 1.1"}
    ]
  end

  defp aliases do
    []
  end
end
