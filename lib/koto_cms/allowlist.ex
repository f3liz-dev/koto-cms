defmodule KotoCms.Allowlist do
  def validate(handle) do
    allowlist = load_allowlist()
    normalized = normalize_handle(handle)
    MapSet.member?(allowlist, normalized)
  end

  def get_all do
    load_allowlist() |> MapSet.to_list() |> Enum.sort()
  end

  defp load_allowlist do
    env_list = System.get_env("DOCUMENT_EDITORS") || ""
    file_path = System.get_env("DOCUMENT_EDITORS_FILE")

    env_handles =
      env_list
      |> String.split(",")
      |> Enum.map(&String.trim/1)
      |> Enum.reject(&(&1 == ""))
      |> Enum.map(&normalize_handle/1)

    file_handles =
      if file_path do
        case File.read(file_path) do
          {:ok, content} ->
            content
            |> String.split("\n")
            |> Enum.map(&String.trim/1)
            |> Enum.reject(&(&1 == ""))
            |> Enum.map(&normalize_handle/1)

          {:error, _} -> []
        end
      else
        []
      end

    MapSet.new(env_handles ++ file_handles)
  end

  defp normalize_handle(handle) do
    handle
    |> String.replace_prefix("@", "")
    |> String.downcase()
  end
end
