<script lang="ts">
  import type { VirtualNode } from '../lib/virtualTree';
  import FileTreeNode from './FileTreeNode.svelte';

  let {
    tree,
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
    tree: VirtualNode[] | null | undefined;
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
</script>

{#if tree && tree.length}
  <div class="file-tree">
    {#each tree as node (node.displayPath || node.name)}
      <FileTreeNode
        {node}
        depth={0}
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
  </div>
{/if}
