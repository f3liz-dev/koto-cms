defmodule KotoCmsWeb.Plugs.Auth do
  import Plug.Conn
  alias KotoCms.Session

  def init(opts), do: opts

  def call(conn, _opts) do
    case get_req_cookie(conn, "cms_session") do
      nil ->
        conn
        |> put_resp_content_type("application/json")
        |> send_resp(401, Jason.encode!(%{error: "Unauthorized"}))
        |> halt()
      
      token ->
        case Session.verify(token) do
          {:ok, session} ->
            assign(conn, :session, session)
          
          {:error, _} ->
            conn
            |> put_resp_content_type("application/json")
            |> send_resp(401, Jason.encode!(%{error: "Unauthorized"}))
            |> halt()
        end
    end
  end
end
