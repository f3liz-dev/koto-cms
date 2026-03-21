defmodule KotoCmsWeb.Plugs.RateLimit do
  import Plug.Conn

  @max_requests 60
  @window_ms 60_000
  @auth_max_requests 10

  def init(opts), do: opts

  def call(conn, _opts) do
    ip = get_ip(conn)
    path = conn.request_path
    
    limit = if String.starts_with?(path, "/auth") or String.starts_with?(path, "/miauth") do
      @auth_max_requests
    else
      @max_requests
    end

    case check_rate(ip, limit) do
      {:ok, _} -> conn
      {:error, retry_after} ->
        conn
        |> put_resp_content_type("application/json")
        |> send_resp(429, Jason.encode!(%{error: "Too many requests"}))
        |> halt()
    end
  end

  defp get_ip(conn) do
    conn
    |> get_req_header("cf-connecting-ip")
    |> case do
      [ip | _] -> ip
      [] ->
        conn
        |> get_req_header("x-forwarded-for")
        |> case do
          [ips | _] -> ips |> String.split(",") |> List.first() |> String.trim()
          [] -> "unknown"
        end
    end
  end

  defp check_rate(ip, max) do
    now = System.monotonic_time(:millisecond)
    key = {__MODULE__, ip}
    
    case :ets.whereis(__MODULE__) do
      :undefined ->
        :ets.new(__MODULE__, [:named_table, :public, :set])
        {:ok, 1}
      _ ->
        case :ets.lookup(__MODULE__, key) do
          [{^key, count, reset_at}] when now < reset_at ->
            if count < max do
              :ets.insert(__MODULE__, {key, count + 1, reset_at})
              {:ok, count + 1}
            else
              {:error, div(reset_at - now, 1000)}
            end
          _ ->
            :ets.insert(__MODULE__, {key, 1, now + @window_ms})
            {:ok, 1}
        end
    end
  end
end
