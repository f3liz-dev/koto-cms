defmodule KotoCmsWeb.AuthController do
  use Phoenix.Controller
  alias KotoCms.{MiAuth, Allowlist, Session}

  def login(conn, %{"handle" => handle}) do
    case Allowlist.validate(handle) do
      false ->
        json(conn, %{error: "#{handle} is not permitted"})
        |> put_status(403)

      true ->
        case MiAuth.initiate_flow(handle) do
          {:ok, result} ->
            parts = String.split(handle, "@")
            domain = List.last(parts)
            instance_url = "https://#{domain}"

            conn
            |> put_resp_cookie("miauth_origin", instance_url,
                 http_only: true, secure: true, max_age: 300, same_site: "Lax")
            |> json(result)

          {:error, reason} ->
            json(conn, %{error: reason})
            |> put_status(500)
        end
    end
  end

  def login(conn, _params) do
    json(conn, %{error: "Invalid handle"})
    |> put_status(400)
  end

  def callback(conn, %{"session" => session_id}) do
    case conn.cookies["miauth_origin"] do
      nil ->
        json(conn, %{error: "Auth session expired or invalid origin"})
        |> put_status(400)

      pinned_instance ->
        case MiAuth.handle_callback(session_id, pinned_instance) do
          {:ok, %{ok: true} = mi_session} ->
            {:ok, token} = Session.create(%{
              fedi_handle: mi_session.fedi_handle,
              author_name: mi_session.author_name,
              author_email: mi_session.author_email
            })

            conn
            |> delete_resp_cookie("miauth_origin")
            |> put_resp_header("set-cookie", Session.cookie(token))
            |> redirect(to: "/")

          {:ok, %{error: error}} ->
            json(conn, %{error: error})
            |> put_status(401)

          {:error, reason} ->
            json(conn, %{error: reason})
            |> put_status(500)
        end
    end
  end

  def callback(conn, _params) do
    json(conn, %{error: "Auth session expired or invalid origin"})
    |> put_status(400)
  end

  def logout(conn, _params) do
    conn
    |> put_resp_header("set-cookie", Session.cookie("", true))
    |> json(%{ok: true})
  end
end
