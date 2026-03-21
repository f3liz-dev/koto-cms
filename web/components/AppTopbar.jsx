export function AppTopbar({ 
  repo, 
  branches, 
  selectedBranch, 
  onSelectBranch, 
  onNewBranch, 
  focusMode, 
  onToggleFocus, 
  onToggleSidebar, 
  sidebarOpen, 
  fileOpen, 
  canSave, 
  onSave,
  showToast 
}) {
  return (
    <header id="app-topbar" class="bg-surface flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm tracking-tight leading-relaxed z-30 app-topbar md:px-6">
      <div class="flex items-center gap-3 md:gap-6">
        <button
          class="inline-flex h-9 w-9 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-low md:hidden"
          type="button"
          aria-label="Toggle sidebar"
          aria-expanded={sidebarOpen}
          onClick={onToggleSidebar}
        >
          <span class="material-symbols-outlined text-xl">{sidebarOpen ? "close" : "menu"}</span>
        </button>
        <span class="text-lg font-bold tracking-tighter">Koto</span>
        <div class="h-4 w-px bg-outline-variant opacity-20 hidden md:block" />
        <span class="hidden md:block text-on-surface-variant max-w-72 truncate">{repo}</span>
      </div>
      <div class="flex w-full flex-wrap items-center justify-end gap-2 md:w-auto md:gap-3">
        <select 
          class="min-w-[10rem] flex-1 rounded-lg border-0 bg-surface-container-low px-3 py-1.5 text-sm font-semibold text-primary focus:ring-primary md:min-w-0 md:flex-none" 
          value={selectedBranch} 
          onChange={(e) => onSelectBranch(e.currentTarget.value)}
        >
          <option value="">— select —</option>
          {branches.map((pr) => (
            <option value={pr.branchName}>{pr.branchName} [{pr.prState}]</option>
          ))}
        </select>
        <button class="px-3 py-1.5 text-sm font-medium text-on-surface-variant hover:bg-surface-container-low rounded-lg" onClick={onNewBranch}>
          New Branch
        </button>
        <button 
          class={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low ${focusMode ? "focus-toggle-active" : ""}`} 
          onClick={() => fileOpen ? onToggleFocus() : showToast("Open a file to enter focus mode.", "error")}
        >
          <span class="material-symbols-outlined text-base">{focusMode ? "close_fullscreen" : "center_focus_strong"}</span>
          <span>{focusMode ? "Exit Focus" : "Focus"}</span>
        </button>
        <button id="btn-save" class="px-5 py-1.5 bg-primary text-on-primary font-bold rounded-lg disabled:opacity-40" disabled={!canSave} onClick={onSave}>
          Commit
        </button>
      </div>
    </header>
  );
}
