import { useState, useCallback, useMemo } from "preact/hooks";
import { Api } from "../api.js";

const MARKDOWN_EXTENSIONS = new Set(["md", "markdown", "mdown", "mkd", "mkdn", "mdx"]);
const VUE_EXTENSIONS = new Set(["vue"]);

function getFileExtension(path) {
  const normalized = (path ?? "").toLowerCase().trim();
  if (!normalized) return "";
  const lastSegment = normalized.split("/").pop() ?? "";
  const dotIndex = lastSegment.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === lastSegment.length - 1) return "";
  return lastSegment.slice(dotIndex + 1);
}

export function useFileEditor() {
  const [filePath, setFilePath] = useState("");
  const [fileSha, setFileSha] = useState(null);
  const [originalContent, setOriginalContent] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [statusText, setStatusText] = useState("");
  const [prInfo, setPrInfo] = useState({ url: "", number: null, state: "none" });

  const fileOpen = Boolean(filePath);
  const extension = getFileExtension(filePath);
  const isMarkdown = MARKDOWN_EXTENSIONS.has(extension);
  const isVue = VUE_EXTENSIONS.has(extension);
  const isPreviewable = isMarkdown || isVue;
  const isDirty = fileOpen && draftContent !== originalContent;

  const editorKey = useMemo(
    () => (filePath ? `${filePath}|${fileSha ?? "new"}` : "none"),
    [filePath, fileSha]
  );

  const openFile = useCallback(async (path, branch) => {
    setStatusText("Loading…");
    const file = await Api.getFile(path, branch);
    setFilePath(file.path);
    setFileSha(file.sha);
    setOriginalContent(file.content);
    setDraftContent(file.content);
    setStatusText("");
    return file;
  }, []);

  const createNewFile = useCallback((path) => {
    setFilePath(path);
    setFileSha(null);
    setOriginalContent("");
    setDraftContent("");
    setStatusText("");
  }, []);

  const saveFile = useCallback(async (branch) => {
    if (!filePath || !branch) return;
    setStatusText("Saving…");
    const result = await Api.saveFile(filePath, draftContent, fileSha, branch);
    setFileSha(null);
    setOriginalContent(draftContent);
    setStatusText("Saved ✓");
    if (result.prUrl) {
      setPrInfo({ url: result.prUrl, number: result.prNumber, state: "draft" });
    }
    setTimeout(() => setStatusText(""), 2500);
    return result;
  }, [filePath, draftContent, fileSha]);

  const deleteFile = useCallback(async (branch) => {
    if (!filePath || !fileSha || !branch) return;
    await Api.deleteFile(filePath, fileSha, branch);
    setFilePath("");
    setFileSha(null);
    setOriginalContent("");
    setDraftContent("");
    setStatusText("");
  }, [filePath, fileSha]);

  const markPrReady = useCallback(async (title, body = "") => {
    if (!prInfo.number) return;
    const result = await Api.markPrReady(prInfo.number, title, body);
    setPrInfo({ url: result.prUrl, number: prInfo.number, state: "open" });
    return result;
  }, [prInfo.number]);

  const closeFile = useCallback(() => {
    setFilePath("");
    setFileSha(null);
    setOriginalContent("");
    setDraftContent("");
    setStatusText("");
  }, []);

  return {
    filePath,
    fileSha,
    originalContent,
    draftContent,
    setDraftContent,
    statusText,
    setStatusText,
    prInfo,
    fileOpen,
    isMarkdown,
    isVue,
    isPreviewable,
    isDirty,
    editorKey,
    openFile,
    createNewFile,
    saveFile,
    deleteFile,
    markPrReady,
    closeFile,
  };
}
