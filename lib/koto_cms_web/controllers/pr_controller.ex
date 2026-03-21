defmodule KotoCmsWeb.PrController do
  use Phoenix.Controller
  alias KotoCms.GitHub

  def list(conn, _params) do
    session = conn.assigns.session

    case GitHub.list_user_prs(session.fedi_handle) do
      {:ok, prs} -> json(conn, prs)
      {:error, reason} ->
        json(conn, %{error: reason})
        |> put_status(500)
    end
  end

  def create(conn, _params) do
    session = conn.assigns.session

    case GitHub.create_working_branch(session.fedi_handle) do
      {:ok, branch_name} ->
        json(conn, %{
          branchName: branch_name,
          prUrl: nil,
          prNumber: nil,
          prState: "draft"
        })

      {:error, reason} ->
        json(conn, %{error: reason})
        |> put_status(500)
    end
  end

  def ready(conn, %{"prNumber" => pr_number, "title" => title} = params) do
    body = params["body"] || ""

    case GitHub.mark_pr_ready(pr_number, title, body) do
      {:ok, result} -> json(conn, result)
      {:error, reason} ->
        json(conn, %{error: reason})
        |> put_status(500)
    end
  end
end
