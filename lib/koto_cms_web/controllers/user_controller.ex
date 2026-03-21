defmodule KotoCmsWeb.UserController do
  use Phoenix.Controller
  alias KotoCms.Session

  def me(conn, _params) do
    session = conn.assigns.session

    json(conn, %{
      fedi_handle: session.fedi_handle,
      author_name: session.author_name,
      author_email: session.author_email,
      custom_email: session[:custom_email]
    })
  end

  def update(conn, %{"custom_email" => email}) do
    session = conn.assigns.session

    if valid_email?(email) do
      {:ok, new_token} = Session.update(session, %{custom_email: String.trim(email)})

      conn
      |> put_resp_header("set-cookie", Session.cookie(new_token))
      |> json(%{ok: true})
    else
      json(conn, %{error: "Invalid email format"})
      |> put_status(400)
    end
  end

  defp valid_email?(email) do
    String.match?(email, ~r/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
  end
end
