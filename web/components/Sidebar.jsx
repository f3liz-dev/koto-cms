import { FileTree } from "./FileTree.jsx";

export function Sidebar({
  repo,
  user,
  branch,
  files,
  dirPath,
  activeTreePath,
  sidebarOpen,
  virtualTree,
  onNavigateUp,
  onOpenFile,
  onNewFile,
  onLogout
}) {
  const useCmsTree = virtualTree && virtualTree.length > 0;

  const treeRows = [];
  if (!useCmsTree) {
    if (dirPath) {
      treeRows.push(
        <div class="tree-item tree-nav-up" data-type="nav-up" onClick={onNavigateUp}>
          <span class="tree-icon">↰</span>..
        </div>
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
          onClick={() => isDir ? onOpenFile(item.path, true) : onOpenFile(item.path, false)}
        >
          <span class="tree-icon">{isDir ? "▸" : "·"}</span>
          {item.name}
        </div>
      );
    }
  }

  return (
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
          {branch && useCmsTree ? (
            <FileTree tree={virtualTree} activePath={activeTreePath} onSelectFile={(path) => onOpenFile(path, false)} />
          ) : (
            <>
              {branch && !files.length && !dirPath ? <p class="empty-hint px-2 py-2 text-xs text-on-surface-variant">No files</p> : null}
              {treeRows}
            </>
          )}
        </div>
      </div>

      <div class="mt-auto border-t border-outline-variant/10 pt-4 space-y-2">
        <div class="flex items-center justify-between rounded-lg bg-surface-container-lowest px-3 py-2">
          <span class="text-xs text-on-surface-variant truncate">{user?.fedi_handle ?? "—"}</span>
          <button class="text-xs font-semibold text-primary hover:underline" onClick={onLogout}>Sign out</button>
        </div>
      </div>
    </aside>
  );
}
