defmodule KotoCms.Session do
  def ttl_hours, do: String.to_integer(System.get_env("SESSION_TTL_HOURS") || "8")
  def ttl_seconds, do: ttl_hours() * 3600
  def token_version, do: String.to_integer(System.get_env("SESSION_TOKEN_VERSION") || "1")

  def create(data) do
    now = System.system_time(:second)

    claims = %{
      "id" => UUID.uuid4(),
      "fedi_handle" => data.fedi_handle,
      "author_name" => data.author_name,
      "author_email" => data.author_email,
      "custom_email" => Map.get(data, :custom_email),
      "created_at" => now,
      "exp" => now + ttl_seconds(),
      "version" => token_version()
    }

    signer = Joken.Signer.create("HS256", secret())
    Joken.generate_and_sign(%{}, claims, signer)
  end

  def verify(token) do
    signer = Joken.Signer.create("HS256", secret())

    case Joken.verify_and_validate(%{}, token, signer) do
      {:ok, claims} ->
        if claims["version"] == token_version() do
          {:ok, atomize_keys(claims)}
        else
          {:error, :invalid_version}
        end

      error -> error
    end
  end

  def update(session, updates) do
    data = Map.merge(session, updates)
    create(data)
  end

  def cookie(token, clear \\ false) do
    if clear do
      "cms_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
    else
      "cms_session=#{token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=#{ttl_seconds()}"
    end
  end

  defp secret do
    System.get_env("SESSION_SECRET") ||
      raise "SESSION_SECRET environment variable is required"
  end

  defp atomize_keys(map) when is_map(map) do
    Map.new(map, fn {k, v} -> {String.to_atom(k), v} end)
  end
end
