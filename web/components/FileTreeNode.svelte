<script lang="ts">
  import type { VirtualNode } from '../lib/virtualTree';
  import Self from './FileTreeNode.svelte';

  let {
    node,
    depth,
    activePath,
    onSelectFile,
    newFileDirPath,
    newFileName,
    onNewFileRequest,
    onNewFileConfirm,
    onNewFileCancel,
    onNewFileNameChange,
    pendingFilePath,
  }: {
    node: VirtualNode;
    depth: number;
    activePath: string;
    onSelectFile: (path: string) => void;
    newFileDirPath: string | null;
    newFileName: string;
    onNewFileRequest: (dirPath: string) => void;
    onNewFileConfirm: () => void;
    onNewFileCancel: () => void;
    onNewFileNameChange: (v: string) => void;
    pendingFilePath: string | null;
  } = $props();

  // svelte-ignore state_referenced_locally
  let expanded = $state(depth < 1);
  const isDir = $derived(node.type === 'dir');
  const isActive = $derived(!isDir && activePath === node.realPath);

  // pending file that lives directly inside this dir (not nested further)
  const pendingInThisDir = $derived.by(() => {
    if (!pendingFilePath || !isDir) return null;
    const prefix = node.realPath + '/';
    if (!pendingFilePath.startsWith(prefix)) return null;
    const rest = pendingFilePath.slice(prefix.length);
    if (rest.includes('/')) return null;
    return rest;
  });

  function toggle(e: MouseEvent) {
    e.stopPropagation();
    expanded = !expanded;
  }

  function select() {
    if (!isDir) onSelectFile(node.realPath);
  }

  function focusOnMount(el: HTMLInputElement) {
    el.focus();
  }

  function handleNewFileHere(e: MouseEvent) {
    e.stopPropagation();
    expanded = true;
    onNewFileRequest(node.realPath);
  }
</script>

<div>
  <div
    class="file-tree-item{isDir ? ' is-dir' : ''}{isActive ? ' active' : ''} group relative flex items-center"
    style="padding-left: {depth * 14 + 8}px"
    onclick={isDir ? toggle : select}
    onkeydown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (isDir) expanded = !expanded;
        else select();
      }
    }}
    role="button"
    tabindex="0"
  >
    <span class="tree-icon shrink-0">
      {isDir ? (expanded ? '▾' : '▸') : '·'}
    </span>
    <span class="flex-1 min-w-0 truncate">{node.name}</span>
    {#if isDir}
      <button
        class="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-on-surface-variant hover:text-primary p-0.5 rounded"
        onclick={handleNewFileHere}
        aria-label="New file in {node.name}"
      >
        <span class="material-symbols-outlined" style="font-size:14px;line-height:1">note_add</span>
      </button>
    {/if}
  </div>
  {#if isDir && expanded && node.children}
    <div class="file-tree-children">
      {#each node.children as child (child.displayPath || child.name)}
        <Self
          node={child}
          depth={depth + 1}
          {activePath}
          {onSelectFile}
          {newFileDirPath}
          {newFileName}
          {onNewFileRequest}
          {onNewFileConfirm}
          {onNewFileCancel}
          {onNewFileNameChange}
          {pendingFilePath}
        />
      {/each}
      {#if pendingInThisDir}
        <div
          class="file-tree-item active flex items-center"
          style="padding-left: {(depth + 1) * 14 + 8}px"
        >
          <span class="tree-icon shrink-0">·</span>
          <span class="flex-1 min-w-0 truncate">{pendingInThisDir}</span>
          <span class="shrink-0 text-primary/50" style="font-size:0.55rem;line-height:1">●</span>
        </div>
      {/if}
      {#if newFileDirPath === node.realPath}
        <div
          class="file-tree-item flex items-center gap-1"
          style="padding-left: {(depth + 1) * 14 + 8}px"
        >
          <span class="material-symbols-outlined shrink-0 text-on-surface-variant" style="font-size:13px;line-height:1">note_add</span>
          {#if node.realPath}
            <span class="text-on-surface-variant/40 text-[0.78rem] select-none shrink-0">{node.realPath}/</span>
          {/if}
          <input
            type="text"
            class="bg-transparent outline-none flex-1 min-w-0 text-[0.78rem] text-on-surface placeholder:text-on-surface-variant/40"
            placeholder="filename.md"
            value={newFileName}
            oninput={(e) => onNewFileNameChange((e.target as HTMLInputElement).value)}
            onkeydown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); onNewFileConfirm(); }
              if (e.key === 'Escape') { e.preventDefault(); onNewFileCancel(); }
            }}
            onblur={() => setTimeout(onNewFileCancel, 100)}
            use:focusOnMount
          />
        </div>
      {/if}
    </div>
  {/if}
</div>
