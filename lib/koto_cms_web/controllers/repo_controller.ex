defmodule KotoCmsWeb.RepoController do
  use Phoenix.Controller

  def index(conn, _params) do
    repo = System.get_env("GITHUB_REPO") || "unknown/unknown"
    json(conn, %{repo: repo})
  end
end
