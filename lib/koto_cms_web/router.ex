defmodule KotoCmsWeb.Router do
  use Phoenix.Router
  import Plug.Conn

  pipeline :api do
    plug :accepts, ["json"]
    plug KotoCmsWeb.Plugs.RateLimit
    plug KotoCmsWeb.Plugs.SecureHeaders
  end

  pipeline :authenticated do
    plug KotoCmsWeb.Plugs.Auth
  end

  scope "/", KotoCmsWeb do
    pipe_through :api

    get "/health", HealthController, :index
    get "/api/diagnostics", DiagnosticsController, :index
    
    get "/auth/login", AuthController, :login
    get "/miauth/callback", AuthController, :callback
    post "/auth/logout", AuthController, :logout
  end

  scope "/api", KotoCmsWeb do
    pipe_through [:api, :authenticated]

    get "/me", UserController, :me
    patch "/me", UserController, :update
    get "/repo", RepoController, :index
    get "/config", FileController, :config
    get "/tree", FileController, :tree
    get "/files", FileController, :list
    get "/file", FileController, :show
    put "/file", FileController, :update
    delete "/file", FileController, :delete
    get "/prs", PrController, :list
    post "/pr-new", PrController, :create
    post "/pr-ready", PrController, :ready
  end
end
