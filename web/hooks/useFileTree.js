import { useState, useCallback } from "preact/hooks";
import { Api } from "../api.js";

function normalizeDirPath(path) {
  return (path ?? "").trim().replace(/^\/+|\/+$/g, "");
}

function parentDir(path) {
  const normalized = normalizeDirPath(path);
  if (!normalized) return "";
  const parts = normalized.split("/");
  parts.pop();
  return parts.join("/");
}

export function useFileTree() {
  const [dirPath, setDirPath] = useState("");
  const [files, setFiles] = useState([]);
  const [activeTreePath, setActiveTreePath] = useState("");

  const loadTree = useCallback(async (ref, nextDir = "") => {
    const normalized = normalizeDirPath(nextDir);
    setDirPath(normalized);
    setFiles([]);
    const list = await Api.listFiles(normalized, ref);
    setFiles(list);
  }, []);

  const navigateUp = useCallback((ref) => {
    return loadTree(ref, parentDir(dirPath));
  }, [dirPath, loadTree]);

  return {
    dirPath,
    files,
    activeTreePath,
    setActiveTreePath,
    loadTree,
    navigateUp,
  };
}
