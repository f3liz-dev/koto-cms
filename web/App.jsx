import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Api } from "./api.js";
import { MarkdownEditor } from "./MarkdownEditor.jsx";
import { PreviewPane } from "./components/PreviewPane.jsx";
import { renderVitepressPreview } from "./preview/renderVitepressPreview.js";

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

const MARKDOWN_EXTENSIONS = new Set(["md", "markdown", "mdown", "mkd", "mkdn", "mdx"]);
const VUE_EXTENSIONS = new Set(["vue"]);

function isMarkdownPath(path) {
  const normalized = (path ?? "").toLowerCase().trim();
  if (!normalized) return false;
  const lastSegment = normalized.split("/").pop() ?? "";
  const dotIndex = lastSegment.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === lastSegment.length - 1) return false;
  return MARKDOWN_EXTENSIONS.has(lastSegment.slice(dotIndex + 1));
}

function isVuePath(path) {
  const normalized = (path ?? "").toLowerCase().trim();
  if (!normalized) return false;
  const lastSegment = normalized.split("/").pop() ?? "";
  const dotIndex = lastSegment.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === lastSegment.length - 1) return false;
  return VUE_EXTENSIONS.has(lastSegment.slice(dotIndex + 1));
}

export function App() {
  const [screen, setScreen] = useState("loading");
  const [handle, setHandle] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [user, setUser] = useState(null);
  const [repo, setRepo] = useState("unknown/unknown");
  const [branches, setBranches] = useState([]);
  const [branch, setBranch] = useState("");
  const [dirPath, setDirPath] = useState("");
  const [files, setFiles] = useState([]);
  const [activeTreePath, setActiveTreePath] = useState("");
  const [focusMode, setFocusMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [previewTab, setPreviewTab] = useState(false);
  const [filePath, setFilePath] = useState("");
  const [fileSha, setFileSha] = useState(null);
  const [originalContent, setOriginalContent] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [statusText, setStatusText] = useState("");
  const [prInfo, setPrInfo] = useState({ url: "", number: null, state: "none" });
  const [toast, setToast] = useState({ msg: "", type: "", visible: false });
  const previewFrameRef = useRef(null);
  const syncingFromEditorRef = useRef(false);
  const lastEditorSyncRef = useRef({ syncIndex: 0, blockProgress: 0, editorScrollRatio: 0 });
  const previewScrollYRef = useRef(0); // last known preview scroll target, baked into srcDoc on rebuild
  const [lazyPreviewContent, setLazyPreviewContent] = useState("");

  const fileOpen = Boolean(filePath);
  const markdownFileOpen = fileOpen && isMarkdownPath(filePath);
  const vueFileOpen = fileOpen && isVuePath(filePath);
  const previewableFileOpen = markdownFileOpen || vueFileOpen;
  const dirty = fileOpen && draftContent !== originalContent;
  const canSave = dirty && Boolean(branch);
  const previewResult = useMemo(() => {
    if (!previewableFileOpen) return { html: "", warnings: [] };
    return renderVitepressPreview(lazyPreviewContent, filePath);
  }, [previewableFileOpen, lazyPreviewContent, filePath]);

  useEffect(() => {
    if (!previewableFileOpen) {
      setLazyPreviewContent("");
      return;
    }
    const timer = window.setTimeout(() => {
      setLazyPreviewContent(draftContent);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [previewableFileOpen, draftContent, filePath]);

  const showToast = useCallback((msg, type = "") => {
    setToast({ msg, type, visible: true });
    setTimeout(() => setToast((prev) => ({ ...prev, visible: false })), 3000);
  }, []);

  const loadBranches = useCallback(async () => {
    const prs = await Api.listPrs();
    setBranches(prs);
  }, []);

  const loadTree = useCallback(async (ref, nextDir = "") => {
    const normalized = normalizeDirPath(nextDir);
    setDirPath(normalized);
    setFiles([]);
    const list = await Api.listFiles(normalized, ref);
    setFiles(list);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("focus-mode", focusMode);
  }, [focusMode]);

  useEffect(() => {
    (async () => {
      try {
        const me = await Api.me();
        setUser(me);
        const repoInfo = await Api.repo();
        setRepo(repoInfo.repo);
        setScreen("app");
        await loadBranches();
      } catch {
        setScreen("login");
      }
    })();
  }, [loadBranches]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape" && focusMode) {
        e.preventDefault();
        setFocusMode(false);
        return;
      }
      if (e.key === "Escape" && previewTab) {
        e.preventDefault();
        setPreviewTab(false);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "s" || e.key === "Enter")) {
        e.preventDefault();
        const saveBtn = document.getElementById("btn-save");
        if (saveBtn && !saveBtn.disabled) saveBtn.click();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [focusMode, previewTab]);

  const editorKey = useMemo(
    () => (filePath ? `${filePath}|${fileSha ?? "new"}` : "none"),
    [filePath, fileSha],
  );

  const emitToPreview = useCallback((syncPoint) => {
    const frame = previewFrameRef.current;
    if (!(frame instanceof HTMLIFrameElement)) return;
    const target = frame.contentWindow;
    if (!target) return;
    target.postMessage(
      {
        type: "cms:sync-editor-block",
        syncIndex: syncPoint?.syncIndex,
        blockProgress: syncPoint?.blockProgress,
        editorScrollRatio: syncPoint?.editorScrollRatio ?? 0,
      },
      "*",
    );
  }, []);

  const onEditorSyncPoint = useCallback((syncPoint) => {
    const next = {
      syncIndex: Number.isFinite(syncPoint?.syncIndex) ? Math.floor(syncPoint.syncIndex) : 0,
      blockProgress: Number.isFinite(syncPoint?.blockProgress) ? syncPoint.blockProgress : 0,
      editorScrollRatio: Number.isFinite(syncPoint?.editorScrollRatio) ? Math.max(0, Math.min(1, syncPoint.editorScrollRatio)) : 0,
    };
    lastEditorSyncRef.current = next;
    emitToPreview(next);
  }, [emitToPreview]);

  // Track the preview's scroll target so we can bake it into the srcDoc
  // when content changes — eliminating the flash-to-top on re-render.
  const onPreviewScrollY = useCallback((y) => {
    previewScrollYRef.current = y;
  }, []);

  useEffect(() => {
    const onMessage = (event) => {
      const frame = previewFrameRef.current;
      if (!(frame instanceof HTMLIFrameElement)) return;
      if (event.source !== frame.contentWindow) return;
      const data = event?.data;
      if (!data || typeof data !== "object") return;
      if (data.type !== "cms:preview-scroll-y") return;
      if (Number.isFinite(data.y)) previewScrollYRef.current = data.y;
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);



  // FIX: Delay slightly so the iframe has time to paint new HTML before we scroll it

  const onLogin = async (e) => {
    e.preventDefault();
    if (!handle.trim()) return;
    setLoginBusy(true);
    setLoginError("");
    try {
      const { sessionUrl } = await Api.loginInit(handle.trim());
      window.location.assign(sessionUrl);
    } catch (err) {
      setLoginError(err.message);
      setLoginBusy(false);
    }
  };

  const onLogout = async () => {
    await Api.logout().catch(() => {});
    setScreen("login");
    setSidebarOpen(false);
    setFocusMode(false);
    setUser(null);
    setBranches([]);
    setBranch("");
    setFiles([]);
    setFilePath("");
  };

  const onSelectBranch = async (nextBranch) => {
    setBranch(nextBranch);
    setSidebarOpen(false);
    setPrInfo({ url: "", number: null, state: "none" });
    setFilePath("");
    setFocusMode(false);
    if (!nextBranch) {
      setFiles([]);
      return;
    }
    try {
      await loadTree(nextBranch, "");
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const openFile = async (path) => {
    try {
      setSidebarOpen(false);
      setStatusText("Loading…");
      const file = await Api.getFile(path, branch);
      setActiveTreePath(path);
      setFilePath(file.path);
      setFileSha(file.sha);
      setOriginalContent(file.content);
      setDraftContent(file.content);
      setLazyPreviewContent(file.content);
      setStatusText("");
    } catch (err) {
      setStatusText(err.message);
      showToast(err.message, "error");
    }
  };

  const onNewBranch = async () => {
    try {
      const result = await Api.newBranch();
      showToast(`Branch created: ${result.branchName}`, "success");
      await loadBranches();
      await onSelectBranch(result.branchName);
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const onNewFile = () => {
    const path = window.prompt("File path (e.g. docs/new-page.md):");
    if (!path) return;
    setSidebarOpen(false);
    setActiveTreePath("");
    setFilePath(path);
    setFileSha(null);
    setOriginalContent("");
    setDraftContent("");
    setLazyPreviewContent("");
    setStatusText("");
  };

  const onSave = async () => {
    if (!filePath || !branch) return;
    setStatusText("Saving…");
    try {
      const result = await Api.saveFile(filePath, draftContent, fileSha, branch);
      setFileSha(null);
      setOriginalContent(draftContent);
      setStatusText("Saved ✓");
      if (result.prUrl) {
        setPrInfo({ url: result.prUrl, number: result.prNumber, state: "draft" });
      }
      await loadTree(branch, dirPath);
      setTimeout(() => setStatusText(""), 2500);
    } catch (err) {
      setStatusText(err.message);
      showToast(err.message, "error");
    }
  };

  const onDelete = async () => {
    if (!filePath || !fileSha || !branch) return;
    if (!window.confirm(`Delete ${filePath}?`)) return;
    setStatusText("Deleting…");
    try {
      await Api.deleteFile(filePath, fileSha, branch);
      setStatusText("");
      setFilePath("");
      setFileSha(null);
      setOriginalContent("");
      setDraftContent("");
      setLazyPreviewContent("");
      await loadTree(branch, dirPath);
      showToast(`Deleted ${filePath}`, "success");
    } catch (err) {
      setStatusText(err.message);
      showToast(err.message, "error");
    }
  };

  const onMarkReady = async () => {
    if (!prInfo.number) return;
    const title = window.prompt("PR title:", `Content update via ${branch}`);
    if (!title) return;
    try {
      const result = await Api.markPrReady(prInfo.number, title, "");
      setPrInfo({ url: result.prUrl, number: prInfo.number, state: "open" });
      showToast("PR is ready for review!", "success");
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const treeRows = [];
  if (dirPath) {
    treeRows.push(
      <div class="tree-item tree-nav-up" data-type="nav-up" onClick={() => loadTree(branch, parentDir(dirPath))}>
        <span class="tree-icon">↰</span>..
      </div>,
    );
  }
  for (const item of files) {
    const isDir = item.type === "dir";
    const active = !isDir && activeTreePath === item.path;
    treeRows.push(
      <div
        class={`tree-item${isDir ? " is-dir" : ""}${active ? " active" : ""}`}
        data-path={item.path}
        data-type={item.type}
        onClick={() => (isDir ? loadTree(branch, item.path) : openFile(item.path))}
      >
        <span class="tree-icon">{isDir ? "▸" : "·"}</span>
        {item.name}
      </div>,
    );
  }

  if (screen === "loading") return null;

  if (screen === "login") {
    return (
      <div id="screen-login" class="screen login-screen">
        <div class="w-full max-w-md rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-8 shadow-sm">
          <div class="mb-8 text-center">
            <p class="text-xs uppercase tracking-[0.2em] text-on-surface-variant">Koto</p>
            <h1 class="mt-2 text-3xl font-extrabold tracking-tight">Sign in</h1>
            <p class="mt-2 text-sm text-on-surface-variant">Use your Fediverse handle to continue.</p>
          </div>
          <form autocomplete="off" class="space-y-4" onSubmit={onLogin}>
            <label class="block text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant">
              Handle
            </label>
            <div class="flex gap-2">
              <input
                class="flex-1 rounded-lg border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:ring-primary"
                type="text"
                value={handle}
                onInput={(e) => setHandle(e.currentTarget.value)}
                placeholder="@you@misskey.io"
                spellcheck={false}
                required
                disabled={loginBusy}
              />
              <button type="submit" class="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-on-primary disabled:opacity-50" disabled={loginBusy}>
                {loginBusy ? "..." : "Sign in"}
              </button>
            </div>
            {loginError ? <p class="text-xs font-semibold text-error">{loginError}</p> : null}
          </form>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* FIX: replaced old flex+overflow structure with app-screen / app-body / editor-main / editor-pane
          so focus mode doesn't fight flex layout */}
      <div id="screen-app" class="screen app-screen">
        <header id="app-topbar" class="bg-surface flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm tracking-tight leading-relaxed z-30 app-topbar md:px-6">
          <div class="flex items-center gap-3 md:gap-6">
            <button
              class="inline-flex h-9 w-9 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-low md:hidden"
              type="button"
              aria-label="Toggle sidebar"
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen((prev) => !prev)}
            >
              <span class="material-symbols-outlined text-xl">{sidebarOpen ? "close" : "menu"}</span>
            </button>
            <span class="text-lg font-bold tracking-tighter">Koto</span>
            <div class="h-4 w-px bg-outline-variant opacity-20 hidden md:block" />
            <span class="hidden md:block text-on-surface-variant max-w-72 truncate">{repo}</span>
          </div>
          <div class="flex w-full flex-wrap items-center justify-end gap-2 md:w-auto md:gap-3">
            <select class="min-w-[10rem] flex-1 rounded-lg border-0 bg-surface-container-low px-3 py-1.5 text-sm font-semibold text-primary focus:ring-primary md:min-w-0 md:flex-none" value={branch} onChange={(e) => onSelectBranch(e.currentTarget.value)}>
              <option value="">— select —</option>
              {branches.map((pr) => (
                <option value={pr.branchName}>{pr.branchName} [{pr.prState}]</option>
              ))}
            </select>
            <button class="px-3 py-1.5 text-sm font-medium text-on-surface-variant hover:bg-surface-container-low rounded-lg" onClick={onNewBranch}>New Branch</button>
            <button class={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low ${focusMode ? "focus-toggle-active" : ""}`} onClick={() => (fileOpen ? setFocusMode(!focusMode) : showToast("Open a file to enter focus mode.", "error"))}>
              <span class="material-symbols-outlined text-base">{focusMode ? "close_fullscreen" : "center_focus_strong"}</span>
              <span>{focusMode ? "Exit Focus" : "Focus"}</span>
            </button>
            <button id="btn-save" class="px-5 py-1.5 bg-primary text-on-primary font-bold rounded-lg disabled:opacity-40" disabled={!canSave} onClick={onSave}>Commit</button>
          </div>
        </header>

        <div class="app-body">
          <aside id="app-sidebar" class={`fixed inset-y-0 left-0 z-40 flex h-full w-[85vw] max-w-72 -translate-x-full flex-col gap-2 bg-surface-container-low px-4 py-6 text-sm font-medium shadow-xl transition-transform duration-200 ease-out md:static md:z-auto md:w-72 md:max-w-none md:translate-x-0 md:shadow-none ${sidebarOpen ? "translate-x-0" : ""}`}>
            <div class="mb-6 px-2 flex items-center gap-3">
              <div class="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-on-primary">
                <span class="material-symbols-outlined icon-filled">description</span>
              </div>
              <div>
                <h2 class="font-extrabold text-sm leading-none">{repo}</h2>
                <p class="text-[10px] text-on-surface-variant uppercase tracking-widest mt-1 opacity-70">Workspace</p>
              </div>
            </div>

            <div class="flex-1 overflow-y-auto custom-scrollbar px-1">
              <div class="flex items-center justify-between px-2 mb-2">
                <span class="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Project Files</span>
                <button class="material-symbols-outlined text-sm text-on-surface-variant hover:text-primary" onClick={onNewFile}>add</button>
              </div>
              <div class="space-y-0.5">
                {!branch ? <p class="empty-hint px-2 py-2 text-xs text-on-surface-variant">Select a branch above</p> : null}
                {branch && !files.length && !dirPath ? <p class="empty-hint px-2 py-2 text-xs text-on-surface-variant">No files</p> : null}
                {treeRows}
              </div>
            </div>

            <div class="mt-auto border-t border-outline-variant/10 pt-4 space-y-2">
              <div class="flex items-center justify-between rounded-lg bg-surface-container-lowest px-3 py-2">
                <span class="text-xs text-on-surface-variant truncate">{user?.fedi_handle ?? "—"}</span>
                <button class="text-xs font-semibold text-primary hover:underline" onClick={onLogout}>Sign out</button>
              </div>
            </div>
          </aside>

          <div
            class={`fixed inset-0 z-30 bg-black/35 transition-opacity duration-200 md:hidden ${sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
            aria-hidden={!sidebarOpen}
            onClick={() => setSidebarOpen(false)}
          />

          <main class="editor-main">
            {!fileOpen ? (
              <div class="no-file-hint">
                <div>
                  <p class="text-2xl font-bold tracking-tight">Select a file to edit</p>
                  <p class="mt-2 text-sm text-on-surface-variant">Choose a branch and file from the left panel.</p>
                </div>
              </div>
            ) : (
              <div id="editor-pane" class="editor-pane">
                <div class="focus-topbar">
                  <div class="flex items-center gap-3">
                    <span class="text-xs font-bold uppercase tracking-[0.18em] text-primary">Editor</span>
                    <span class="h-4 w-px bg-outline-variant/30" />
                    <span class="text-sm font-semibold text-on-surface">{filePath}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    {previewableFileOpen ? (
                      <button class="flex items-center gap-1 rounded-lg bg-surface-container-low px-3 py-1.5 text-xs font-semibold text-on-surface hover:bg-surface-container" onClick={() => setPreviewTab(true)}>
                        <span class="material-symbols-outlined text-sm">visibility</span>
                        <span>Preview</span>
                      </button>
                    ) : null}
                    <button class="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-on-primary" onClick={() => setFocusMode(false)}>
                      <span>Exit</span>
                      <span class="material-symbols-outlined text-sm">close</span>
                    </button>
                  </div>
                </div>

                <div id="editor-filebar" class="flex flex-wrap items-center justify-between gap-2 bg-surface-container-low/30 px-4 py-3 md:px-8 md:py-4">
                  <div class="flex min-w-0 items-center gap-3 md:gap-4">
                    <h1 class="truncate text-base font-bold tracking-tight text-on-surface md:text-xl">{filePath}</h1>
                    <span class="text-[11px] bg-secondary-container text-on-secondary-container px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter">{statusText || (dirty ? "Unsaved changes" : "")}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <button class="px-3 py-1.5 rounded-lg text-sm font-semibold text-error hover:bg-error/10" hidden={!fileSha} onClick={onDelete}>Delete</button>
                    <button class="px-4 py-1.5 rounded-lg text-sm font-semibold bg-secondary-container text-on-secondary-container hover:opacity-90" hidden={prInfo.state !== "draft"} onClick={onMarkReady}>Mark PR Ready</button>
                  </div>
                </div>

                <div class={`editor-workspace${previewableFileOpen && !focusMode ? " has-preview" : ""}`}>
                  <div class="editor-textarea-wrap writing-canvas custom-scrollbar">
                    {markdownFileOpen ? (
                      <MarkdownEditor
                        editorKey={editorKey}
                        value={draftContent}
                        onChange={setDraftContent}
                        onSyncPoint={onEditorSyncPoint}
                      />
                    ) : (
                      <textarea
                        class="plain-editor"
                        value={draftContent}
                        onInput={(e) => setDraftContent(e.currentTarget.value)}
                        spellcheck={false}
                      />
                    )}
                  </div>
                  {previewableFileOpen && !focusMode ? (
                    <PreviewPane frameRef={previewFrameRef} previewResult={previewResult} initialScrollY={previewScrollYRef.current} onScrollY={onPreviewScrollY} />
                  ) : null}
                </div>

                <footer id="editor-footer" class="flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant/10 bg-surface-container-lowest px-4 py-3 md:px-8">
                  <div class="flex items-center gap-2 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest" hidden={!prInfo.url}>
                    <span>PR</span>
                    <a class="text-primary hover:underline normal-case tracking-normal" href={prInfo.url || "#"} target="_blank" rel="noopener">#{prInfo.number ?? "—"}</a>
                    <span class={`pr-state ${prInfo.state}`}>{prInfo.state}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-sm text-secondary icon-filled">cloud_done</span>
                    <span class="text-[10px] font-bold text-secondary uppercase tracking-widest">Synced</span>
                  </div>
                </footer>
              </div>
            )}
          </main>
        </div>
      </div>

      <div class={`toast ${toast.type} ${toast.visible ? "show" : ""}`} hidden={!toast.msg}>
        {toast.msg}
      </div>

      {previewTab && previewableFileOpen ? (
        <div class="preview-tab-overlay">
          <div class="preview-tab-container">
            <div class="preview-tab-header">
              <div class="flex items-center gap-3">
                <span class="text-xs font-bold uppercase tracking-[0.18em] text-primary">Preview</span>
                <span class="h-4 w-px bg-outline-variant/30" />
                <span class="text-sm font-semibold text-on-surface">{filePath}</span>
              </div>
              <button class="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-on-primary" onClick={() => setPreviewTab(false)}>
                <span>Close</span>
                <span class="material-symbols-outlined text-sm">close</span>
              </button>
            </div>
            <div class="preview-tab-content">
              <PreviewPane frameRef={previewFrameRef} previewResult={previewResult} initialScrollY={previewScrollYRef.current} onScrollY={onPreviewScrollY} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}