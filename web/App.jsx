import { useEffect, useState, useMemo, useCallback } from "preact/hooks";
import { useAuth } from "./hooks/useAuth.js";
import { useBranches } from "./hooks/useBranches.js";
import { useFileTree } from "./hooks/useFileTree.js";
import { useFileEditor } from "./hooks/useFileEditor.js";
import { useToast } from "./hooks/useToast.js";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts.js";
import { LoginScreen } from "./components/LoginScreen.jsx";
import { AppTopbar } from "./components/AppTopbar.jsx";
import { Sidebar } from "./components/Sidebar.jsx";
import { FileEditor } from "./components/FileEditor.jsx";
import { Toast } from "./components/Toast.jsx";
import { buildVirtualTree, nestTree, extractLocale } from "./lib/virtualTree.js";
import { Api } from "./api.js";

export function App() {
  const { user, repo, loading, isAuthenticated, logout } = useAuth();
  const { branches, selectedBranch, setSelectedBranch, loadBranches, createBranch } = useBranches();
  const { dirPath, files, activeTreePath, setActiveTreePath, loadTree, navigateUp } = useFileTree();
  const fileEditor = useFileEditor();
  const { toast, showToast } = useToast();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [cmsConfig, setCmsConfig] = useState(null);
  const [virtualTree, setVirtualTree] = useState([]);
  const [contentGroups, setContentGroups] = useState(new Map());
  const [activeLocale, setActiveLocale] = useState(null);
  const [activeContentKey, setActiveContentKey] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  const canSave = fileEditor.isDirty && Boolean(selectedBranch);

  const loadCmsTree = useCallback(async (ref) => {
    try {
      const cfg = await Api.getConfig(ref);
      setCmsConfig(cfg);
      const hasConfig = cfg && (cfg.include?.length || cfg.exclude?.length || cfg.i18n);
      if (!hasConfig) {
        setVirtualTree([]);
        setContentGroups(new Map());
        return false;
      }
      const flatFiles = await Api.getTree(ref);
      const { nodes, contentGroups: groups } = buildVirtualTree(flatFiles, cfg);
      const nested = nestTree(nodes);
      setVirtualTree(nested);
      setContentGroups(groups);
      return true;
    } catch {
      setCmsConfig(null);
      setVirtualTree([]);
      setContentGroups(new Map());
      return false;
    }
  }, []);

  // Focus mode body class
  useEffect(() => {
    document.body.classList.toggle("focus-mode", focusMode);
  }, [focusMode]);

  // Load branches on mount
  useEffect(() => {
    if (isAuthenticated) {
      loadBranches();
    }
  }, [isAuthenticated, loadBranches]);

  // Fetch Cloudflare preview URL when PR number changes
  useEffect(() => {
    const prNumber = fileEditor.prInfo?.number;
    if (!prNumber) {
      setPreviewUrl(null);
      return;
    }
    let cancelled = false;
    Api.getPrPreview(prNumber)
      .then((data) => { if (!cancelled) setPreviewUrl(data.previewUrl || null); })
      .catch(() => { if (!cancelled) setPreviewUrl(null); });
    return () => { cancelled = true; };
  }, [fileEditor.prInfo?.number]);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onSave: handleSave,
    onEscape: () => {
      if (focusMode) setFocusMode(false);
    },
    canSave,
    focusMode,
  });

  async function handleSelectBranch(branchName) {
    setSelectedBranch(branchName);
    setSidebarOpen(false);
    fileEditor.closeFile();
    setFocusMode(false);
    setActiveLocale(null);
    setActiveContentKey(null);
    setPreviewUrl(null);
    if (!branchName) {
      setVirtualTree([]);
      setContentGroups(new Map());
      return;
    }
    try {
      const usedCmsTree = await loadCmsTree(branchName);
      if (!usedCmsTree) {
        await loadTree(branchName, "");
      }
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function handleOpenFile(path, isDir) {
    if (isDir) {
      await loadTree(selectedBranch, path);
      return;
    }
    try {
      setSidebarOpen(false);
      await fileEditor.openFile(path, selectedBranch);
      setActiveTreePath(path);
      if (cmsConfig?.i18n && cmsConfig.i18n.mode !== "none") {
        const { locale, contentKey } = extractLocale(path, cmsConfig.i18n);
        setActiveLocale(locale);
        setActiveContentKey(contentKey);
      } else {
        setActiveLocale(null);
        setActiveContentKey(null);
      }
    } catch (err) {
      fileEditor.setStatusText(err.message);
      showToast(err.message, "error");
    }
  }

  function handleNewFile() {
    const path = window.prompt("File path (e.g. docs/new-page.md):");
    if (!path) return;
    setSidebarOpen(false);
    setActiveTreePath("");
    fileEditor.createNewFile(path);
  }

  async function handleNewBranch() {
    try {
      const result = await createBranch();
      showToast(`Branch created: ${result.branchName}`, "success");
      await handleSelectBranch(result.branchName);
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function handleSave() {
    if (!canSave) return;
    try {
      await fileEditor.saveFile(selectedBranch);
      if (virtualTree.length) {
        await loadCmsTree(selectedBranch);
      } else {
        await loadTree(selectedBranch, dirPath);
      }
    } catch (err) {
      fileEditor.setStatusText(err.message);
      showToast(err.message, "error");
    }
  }

  async function handleDelete() {
    if (!fileEditor.filePath || !fileEditor.fileSha || !selectedBranch) return;
    if (!window.confirm(`Delete ${fileEditor.filePath}?`)) return;
    fileEditor.setStatusText("Deleting…");
    try {
      await fileEditor.deleteFile(selectedBranch);
      if (virtualTree.length) {
        await loadCmsTree(selectedBranch);
      } else {
        await loadTree(selectedBranch, dirPath);
      }
      showToast(`Deleted ${fileEditor.filePath}`, "success");
    } catch (err) {
      fileEditor.setStatusText(err.message);
      showToast(err.message, "error");
    }
  }

  async function handleMarkReady() {
    const title = window.prompt("PR title:", `Content update via ${selectedBranch}`);
    if (!title) return;
    try {
      await fileEditor.markPrReady(title, "");
      showToast("PR is ready for review!", "success");
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  const onSwitchLocale = useCallback(async (locale) => {
    if (!activeContentKey || !contentGroups.has(activeContentKey)) return;
    const localeMap = contentGroups.get(activeContentKey);
    const node = localeMap.get(locale);
    if (node) await handleOpenFile(node.realPath, false);
  }, [activeContentKey, contentGroups]);

  const currentLocales = useMemo(() => {
    if (!activeContentKey || !contentGroups.has(activeContentKey)) return [];
    return [...contentGroups.get(activeContentKey).keys()];
  }, [activeContentKey, contentGroups]);

  async function handleLogout() {
    await logout();
    setSidebarOpen(false);
    setFocusMode(false);
    setSelectedBranch("");
  }

  if (loading) return null;
  if (!isAuthenticated) return <LoginScreen />;

  return (
    <>
      <div id="screen-app" class="screen app-screen">
        <AppTopbar
          repo={repo}
          branches={branches}
          selectedBranch={selectedBranch}
          onSelectBranch={handleSelectBranch}
          onNewBranch={handleNewBranch}
          focusMode={focusMode}
          onToggleFocus={() => setFocusMode(!focusMode)}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          sidebarOpen={sidebarOpen}
          fileOpen={fileEditor.fileOpen}
          canSave={canSave}
          onSave={handleSave}
          showToast={showToast}
        />

        <div class="app-body">
          <Sidebar
            repo={repo}
            user={user}
            branch={selectedBranch}
            files={files}
            dirPath={dirPath}
            activeTreePath={activeTreePath}
            sidebarOpen={sidebarOpen}
            virtualTree={virtualTree}
            onNavigateUp={() => navigateUp(selectedBranch)}
            onOpenFile={handleOpenFile}
            onNewFile={handleNewFile}
            onLogout={handleLogout}
          />

          <div
            class={`fixed inset-0 z-30 bg-black/35 transition-opacity duration-200 md:hidden ${sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
            aria-hidden={!sidebarOpen}
            onClick={() => setSidebarOpen(false)}
          />

          <main class="editor-main">
            {!fileEditor.fileOpen ? (
              <div class="no-file-hint">
                <div>
                  <p class="text-2xl font-bold tracking-tight">Select a file to edit</p>
                  <p class="mt-2 text-sm text-on-surface-variant">Choose a branch and file from the left panel.</p>
                </div>
              </div>
            ) : (
              <FileEditor
                filePath={fileEditor.filePath}
                fileSha={fileEditor.fileSha}
                statusText={fileEditor.statusText}
                isDirty={fileEditor.isDirty}
                prInfo={fileEditor.prInfo}
                isMarkdown={fileEditor.isMarkdown}
                draftContent={fileEditor.draftContent}
                setDraftContent={fileEditor.setDraftContent}
                editorKey={fileEditor.editorKey}
                onDelete={handleDelete}
                onMarkReady={handleMarkReady}
                focusMode={focusMode}
                setFocusMode={setFocusMode}
                previewUrl={previewUrl}
                currentLocales={currentLocales}
                activeLocale={activeLocale}
                onSwitchLocale={onSwitchLocale}
              />
            )}
          </main>
        </div>
      </div>

      <Toast toast={toast} />
    </>
  );
}
