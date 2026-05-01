<script lang="ts">
  import type { BootstrapUser, FileEntry } from '../api';
  import type { VirtualNode } from '../lib/virtualTree';
  import FileTree from './FileTree.svelte';

  let {
    repo,
    user,
    branch,
    files,
    dirPath,
    activeTreePath,
    sidebarOpen,
    virtualTree,
    pendingFilePath,
    onNavigateUp,
    onOpenFile,
    onNewFile,
    onLogout,
  }: {
    repo: string;
    user: BootstrapUser | null;
    branch: string;
    files: FileEntry[];
    dirPath: string;
    activeTreePath: string;
    sidebarOpen: boolean;
    virtualTree: VirtualNode[];
    pendingFilePath: string | null;
    onNavigateUp: () => void;
    onOpenFile: (path: string, isDir: boolean) => void;
    onNewFile: (path: string) => void;
    onLogout: () => void;
  } = $props();

  const useCmsTree = $derived(virtualTree && virtualTree.length > 0);

  let newFileDirPath = $state<string | null>(null);
  let newFileName = $state('');

  function requestNewFile(dir: string) {
    newFileDirPath = dir;
    newFileName = '';
  }

  function confirmNewFile() {
    const name = newFileName.trim();
    if (!name) { cancelNewFile(); return; }
    const fullPath = newFileDirPath ? `${newFileDirPath}/${name}` : name;
    onNewFile(fullPath);
    cancelNewFile();
  }

  function cancelNewFile() {
    newFileDirPath = null;
    newFileName = '';
  }

  function focusOnMount(el: HTMLInputElement) {
    el.focus();
  }

  // pending file at root level (no directory prefix)
  const rootPending = $derived(
    pendingFilePath && !pendingFilePath.includes('/') ? pendingFilePath : null,
  );
</script>

<aside
  id="app-sidebar"
  class="fixed inset-y-0 left-0 z-40 flex h-full w-[85vw] max-w-72 -translate-x-full flex-col gap-2 bg-surface-container-low px-4 py-6 text-sm font-medium shadow-xl transition-transform duration-200 ease-out md:static md:z-auto md:w-72 md:max-w-none md:translate-x-0 md:shadow-none {sidebarOpen
    ? 'translate-x-0'
    : ''}"
>
  <div class="mb-6 px-2 flex items-center gap-3">
    <div class="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-on-primary">
      <span class="material-symbols-outlined icon-filled">description</span>
    </div>
    <div>
      <h2 class="font-extrabold text-sm leading-none">{repo}</h2>
      <p class="text-[10px] text-on-surface-variant uppercase tracking-widest mt-1 opacity-70">
        Workspace
      </p>
    </div>
  </div>

  <div class="flex-1 overflow-y-auto custom-scrollbar px-1">
    <div class="flex items-center justify-between px-2 mb-2">
      <span class="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
        Project Files
      </span>
      <button
        class="material-symbols-outlined text-sm text-on-surface-variant hover:text-primary"
        onclick={() => requestNewFile('')}
        aria-label="New file"
      >
        add
      </button>
    </div>
    <div class="space-y-0.5">
      {#if !branch}
        <p class="empty-hint px-2 py-2 text-xs text-on-surface-variant">Select a branch above</p>
      {:else if useCmsTree}
        <FileTree
          tree={virtualTree}
          activePath={activeTreePath}
          onSelectFile={(path) => onOpenFile(path, false)}
          {newFileDirPath}
          {newFileName}
          onNewFileRequest={requestNewFile}
          onNewFileConfirm={confirmNewFile}
          onNewFileCancel={cancelNewFile}
          onNewFileNameChange={(v) => (newFileName = v)}
          {pendingFilePath}
        />
        {#if rootPending}
          <div class="file-tree-item active flex items-center" style="padding-left: 8px">
            <span class="tree-icon shrink-0">·</span>
            <span class="flex-1 min-w-0 truncate">{rootPending}</span>
            <span class="shrink-0 text-primary/50" style="font-size:0.55rem;line-height:1">●</span>
          </div>
        {/if}
        {#if newFileDirPath === '' && branch}
          <div class="file-tree-item flex items-center gap-1" style="padding-left: 8px">
            <span class="material-symbols-outlined shrink-0 text-on-surface-variant" style="font-size:13px;line-height:1">note_add</span>
            <input
              type="text"
              class="bg-transparent outline-none flex-1 min-w-0 text-[0.78rem] text-on-surface placeholder:text-on-surface-variant/40"
              placeholder="filename.md"
              value={newFileName}
              oninput={(e) => (newFileName = (e.target as HTMLInputElement).value)}
              onkeydown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); confirmNewFile(); }
                if (e.key === 'Escape') { e.preventDefault(); cancelNewFile(); }
              }}
              onblur={() => setTimeout(cancelNewFile, 100)}
              use:focusOnMount
            />
          </div>
        {/if}
      {:else}
        {#if !files.length && !dirPath}
          <p class="empty-hint px-2 py-2 text-xs text-on-surface-variant">No files</p>
        {/if}
        {#if dirPath}
          <div
            class="tree-item tree-nav-up"
            data-type="nav-up"
            onclick={onNavigateUp}
            onkeydown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onNavigateUp();
              }
            }}
            role="button"
            tabindex="0"
          >
            <span class="tree-icon">↰</span>..
          </div>
        {/if}
        {#each files as item (item.path)}
          {@const isDir = item.type === 'dir'}
          {@const active = !isDir && activeTreePath === item.path}
          <div
            class="tree-item{isDir ? ' is-dir' : ''}{active ? ' active' : ''}"
            data-path={item.path}
            data-type={item.type}
            onclick={() => onOpenFile(item.path, isDir)}
            onkeydown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpenFile(item.path, isDir);
              }
            }}
            role="button"
            tabindex="0"
          >
            <span class="tree-icon">{isDir ? '▸' : '·'}</span>
            {item.name}
          </div>
        {/each}
        {#if rootPending}
          <div class="file-tree-item active flex items-center" style="padding-left: 8px">
            <span class="tree-icon shrink-0">·</span>
            <span class="flex-1 min-w-0 truncate">{rootPending}</span>
            <span class="shrink-0 text-primary/50" style="font-size:0.55rem;line-height:1">●</span>
          </div>
        {/if}
        {#if newFileDirPath === '' && branch}
          <div class="file-tree-item flex items-center gap-1" style="padding-left: 8px">
            <span class="material-symbols-outlined shrink-0 text-on-surface-variant" style="font-size:13px;line-height:1">note_add</span>
            <input
              type="text"
              class="bg-transparent outline-none flex-1 min-w-0 text-[0.78rem] text-on-surface placeholder:text-on-surface-variant/40"
              placeholder="filename.md"
              value={newFileName}
              oninput={(e) => (newFileName = (e.target as HTMLInputElement).value)}
              onkeydown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); confirmNewFile(); }
                if (e.key === 'Escape') { e.preventDefault(); cancelNewFile(); }
              }}
              onblur={() => setTimeout(cancelNewFile, 100)}
              use:focusOnMount
            />
          </div>
        {/if}
      {/if}
    </div>
  </div>

  <div class="mt-auto border-t border-outline-variant/10 pt-4 space-y-2">
    <div class="flex items-center justify-between rounded-lg bg-surface-container-lowest px-3 py-2">
      <span class="text-xs text-on-surface-variant truncate">
        {user?.fedi_handle ?? '—'}
      </span>
      <button class="text-xs font-semibold text-primary hover:underline" onclick={onLogout}>
        Sign out
      </button>
    </div>
  </div>
</aside>
