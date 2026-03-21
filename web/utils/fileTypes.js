const MARKDOWN_EXTENSIONS = new Set(["md", "markdown", "mdown", "mkd", "mkdn", "mdx"]);
const VUE_EXTENSIONS = new Set(["vue"]);

export function getFileExtension(path) {
  const normalized = (path ?? "").toLowerCase().trim();
  if (!normalized) return "";
  const lastSegment = normalized.split("/").pop() ?? "";
  const dotIndex = lastSegment.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === lastSegment.length - 1) return "";
  return lastSegment.slice(dotIndex + 1);
}

export function isMarkdownPath(path) {
  return MARKDOWN_EXTENSIONS.has(getFileExtension(path));
}

export function isVuePath(path) {
  return VUE_EXTENSIONS.has(getFileExtension(path));
}

export function isPreviewablePath(path) {
  return isMarkdownPath(path) || isVuePath(path);
}
