<script lang="ts">
  import { useAuth } from './hooks/useAuth.svelte';
  import { useBranches } from './hooks/useBranches.svelte';
  import { useFileTree } from './hooks/useFileTree.svelte';
  import { useFileEditor } from './hooks/useFileEditor.svelte';
  import { useToast } from './hooks/useToast.svelte';
  import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.svelte';
  import { useRealtime } from './hooks/useRealtime.svelte';
  import LoginScreen from './components/LoginScreen.svelte';
  import TenantPickerScreen from './components/TenantPickerScreen.svelte';
  import AppTopbar from './components/AppTopbar.svelte';
  import Sidebar from './components/Sidebar.svelte';
  import FileEditor from './components/FileEditor.svelte';
  import Toast from './components/Toast.svelte';
  import { buildVirtualTree, nestTree, extractLocale, type VirtualNode } from './lib/virtualTree';
  import { isMarkdownPath } from './utils/fileTypes';
  import type { LinkTarget } from './LinkSuggestion';
  import { Api, type CmsConfig, type DraftEntry } from './api';
  import PublishDialog from './components/PublishDialog.svelte';

  const auth = useAuth();
  const branchesApi = useBranches();
  const tree = useFileTree();
  const fileEditor = useFileEditor();
  const toast = useToast();
  const realtime = useRealtime();

  let sidebarOpen = $state(false);
  let focusMode = $state(false);
  let cmsConfig = $state<CmsConfig | null>(null);
  let virtualTree = $state<VirtualNode[]>([]);
  let contentGroups = $state<Map<string, Map<string, VirtualNode>>>(new Map());
  let activeLocale = $state<string | null>(null);
  let activeContentKey = $state<string | null>(null);
  let previewUrl = $state<string | null>(null);
  let draftsMap = $state<Map<string, DraftEntry>>(new Map());
  let publishDialog = $state<{ open: boolean; drafts: DraftEntry[] }>({ open: false, drafts: [] });

  const canSave = $derived(fileEditor.isDirty);
  const pendingFilePath = $derived(
    fileEditor.fileSha === null && fileEditor.filePath ? fileEditor.filePath : null,
  );

  const otherEditors = $derived.by(() => {
    const me = auth.user?.fedi_handle;
    if (!fileEditor.filePath || !me) return [];
    return realtime.editors.filter(
      (e) => e.path === fileEditor.filePath && e.handle !== me,
    );
  });

  const flatLinkTargets = $derived.by<LinkTarget[]>(() => {
    const out: LinkTarget[] = [];
    function walk(nodes: VirtualNode[]) {
      for (const n of nodes) {
        if (n.type === 'file' && isMarkdownPath(n.realPath)) {
          const title = n.name.replace(/\.[^.]+$/, '');
          out.push({ path: n.realPath, title });
        }
        if (n.children) walk(n.children);
      }
    }
    walk(virtualTree);
    if (!out.length) {
      for (const f of tree.files) {
        if (f.type === 'file' && isMarkdownPath(f.path)) {
          out.push({ path: f.path, title: f.name.replace(/\.[^.]+$/, '') });
        }
      }
    }
    return out;
  });

  const MAX_ASSET_BYTES = 5 * 1024 * 1024;
  const ALLOWED_ASSET_MIME = new Set([
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/avif',
  ]);

  async function uploadAsset(file: File): Promise<string> {
    const branch = branchesApi.selectedBranch;
    if (!branch) {
      const msg = 'Pick a draft before uploading';
      toast.showToast(msg, 'error');
      throw new Error(msg);
    }
    if (!ALLOWED_ASSET_MIME.has(file.type)) {
      const msg = `Unsupported image type${file.type ? `: ${file.type}` : ''}. Allowed: PNG, JPEG, GIF, WebP, AVIF.`;
      toast.showToast(msg, 'error');
      throw new Error(msg);
    }
    if (file.size > MAX_ASSET_BYTES) {
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      const msg = `Image too large: ${mb} MB (max 5 MB).`;
      toast.showToast(msg, 'error');
      throw new Error(msg);
    }
    const currentPath = fileEditor.filePath;
    const dirParts = currentPath.split('/');
    dirParts.pop();
    const baseDir = dirParts.join('/');
    const dir = baseDir ? `${baseDir}/images` : 'images';
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
    const filename = `${crypto.randomUUID()}.${ext}`;
    const contentBase64 = await fileToBase64(file);
    try {
      await Api.uploadAsset({
        dir,
        filename,
        contentType: file.type,
        contentBase64,
        branch,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.showToast(msg, 'error');
      throw err;
    }
    return `images/${filename}`;
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(reader.error ?? new Error('read error'));
      reader.readAsDataURL(file);
    });
  }

  function setDraftEntry(entry: DraftEntry) {
    const next = new Map(draftsMap);
    next.set(entry.path, entry);
    draftsMap = next;
  }

  function deleteDraftEntry(path: string) {
    if (!draftsMap.has(path)) return;
    const next = new Map(draftsMap);
    next.delete(path);
    draftsMap = next;
  }

  async function loadCmsTree(ref: string): Promise<boolean> {
    try {
      const cfg = await Api.getConfig(ref);
      cmsConfig = cfg;
      const hasConfig = cfg && ((cfg.include?.length ?? 0) || (cfg.exclude?.length ?? 0) || cfg.i18n);
      if (!hasConfig) {
        virtualTree = [];
        contentGroups = new Map();
        return false;
      }
      const flatFiles = await Api.getTree(ref);
      const { nodes, contentGroups: groups } = buildVirtualTree(flatFiles, cfg);
      const nested = nestTree(nodes);
      virtualTree = nested;
      contentGroups = groups;
      return true;
    } catch {
      cmsConfig = null;
      virtualTree = [];
      contentGroups = new Map();
      return false;
    }
  }

  $effect(() => {
    document.body.classList.toggle('focus-mode', focusMode);
  });

  let bootstrapApplied = false;
  $effect(() => {
    if (auth.state.kind !== 'authenticated' || bootstrapApplied) return;
    bootstrapApplied = true;
    const cfg = auth.state.config;
    const flatFiles = auth.state.tree;
    cmsConfig = cfg;
    branchesApi.setBranches(auth.state.branches);
    draftsMap = new Map(auth.state.drafts.map((d) => [d.path, d]));
    const hasCfg = Boolean(
      (cfg.include?.length ?? 0) || (cfg.exclude?.length ?? 0) || cfg.i18n,
    );
    if (hasCfg) {
      const { nodes, contentGroups: groups } = buildVirtualTree(flatFiles, cfg);
      virtualTree = nestTree(nodes);
      contentGroups = groups;
    } else {
      virtualTree = [];
      contentGroups = new Map();
    }
  });

  // Broadcast the editing path to peers via WebSocket presence.
  $effect(() => {
    realtime.setEditing(fileEditor.filePath || null);
  });

  // Toast when a peer edits or publishes; reload branches on remote publish.
  $effect(() =>
    realtime.onDraftSaved((ev) => {
      const me = auth.user?.fedi_handle;
      if (!me || ev.by === me) return;
      toast.showToast(`${ev.by} edited ${ev.path}`);
    }),
  );
  $effect(() =>
    realtime.onPublished((ev) => {
      const me = auth.user?.fedi_handle;
      if (!me || ev.by === me) return;
      toast.showToast(`${ev.by} published ${ev.files.length} file(s)`, 'success');
      branchesApi.loadBranches().catch(() => {});
    }),
  );

  // Auto-save the current edit to the DO buffer (debounced).
  $effect(() => {
    const path = fileEditor.filePath;
    const content = fileEditor.draftContent;
    const original = fileEditor.originalContent;
    const sha = fileEditor.fileSha;
    if (!path) return;
    if (content === original) {
      if (draftsMap.has(path)) {
        Api.deleteDraft(path).catch(() => {});
        deleteDraftEntry(path);
      }
      return;
    }
    const timer = setTimeout(() => {
      Api.saveDraft({ path, content, sha })
        .then((r) => setDraftEntry({ path, content, sha, savedAt: r.savedAt }))
        .catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
  });

  $effect(() => {
    const prNumber = fileEditor.prInfo.number;
    if (!prNumber) {
      previewUrl = null;
      return;
    }
    let cancelled = false;
    Api.getPrPreview(prNumber)
      .then((data) => {
        if (!cancelled) previewUrl = data.previewUrl ?? null;
      })
      .catch(() => {
        if (!cancelled) previewUrl = null;
      });
    return () => {
      cancelled = true;
    };
  });

  useKeyboardShortcuts({
    onSave: () => {
      handleSave().catch(() => {});
    },
    onEscape: () => {
      if (focusMode) focusMode = false;
    },
    canSave: () => canSave,
    focusMode: () => focusMode,
  });

  async function handleSelectBranch(branchName: string) {
    branchesApi.selectedBranch = branchName;
    sidebarOpen = false;
    fileEditor.closeFile();
    focusMode = false;
    activeLocale = null;
    activeContentKey = null;
    previewUrl = null;
    if (!branchName) {
      virtualTree = [];
      contentGroups = new Map();
      return;
    }
    try {
      const usedCmsTree = await loadCmsTree(branchName);
      if (!usedCmsTree) {
        await tree.loadTree(branchName, '');
      }
    } catch (err) {
      toast.showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  async function handleOpenFile(path: string, isDir: boolean) {
    if (isDir) {
      await tree.loadTree(branchesApi.selectedBranch, path);
      return;
    }
    try {
      sidebarOpen = false;
      const ref = branchesApi.selectedBranch || (auth.state.kind === 'authenticated' ? auth.state.defaultBranch : '');
      await fileEditor.openFile(path, ref);
      const draft = draftsMap.get(path);
      if (draft) fileEditor.setDraftContent(draft.content);
      tree.activeTreePath = path;
      if (cmsConfig?.i18n && cmsConfig.i18n.mode !== 'none') {
        const { locale, contentKey } = extractLocale(path, cmsConfig.i18n);
        activeLocale = locale;
        activeContentKey = contentKey;
      } else {
        activeLocale = null;
        activeContentKey = null;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fileEditor.setStatusText(msg);
      toast.showToast(msg, 'error');
    }
  }

  function handleNewFile(path: string) {
    sidebarOpen = false;
    tree.activeTreePath = path;
    fileEditor.createNewFile(path);
  }

  async function handleSave() {
    if (!fileEditor.isDirty && draftsMap.size === 0) return;
    try {
      // Flush the current edit synchronously so it shows up in the publish list.
      if (fileEditor.isDirty && fileEditor.filePath) {
        const path = fileEditor.filePath;
        const content = fileEditor.draftContent;
        const sha = fileEditor.fileSha;
        const r = await Api.saveDraft({ path, content, sha });
        setDraftEntry({ path, content, sha, savedAt: r.savedAt });
      }
      const list = await Api.listDrafts();
      if (list.length === 0) {
        toast.showToast('Nothing to publish');
        return;
      }
      // Sort by path for a stable list.
      list.sort((a, b) => a.path.localeCompare(b.path));
      publishDialog = { open: true, drafts: list };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.showToast(msg, 'error');
    }
  }

  async function handleConfirmPublish() {
    publishDialog = { open: false, drafts: [] };
    fileEditor.setStatusText('Publishing…');
    try {
      const result = await Api.publish();
      branchesApi.selectedBranch = result.branchName;
      await branchesApi.loadBranches();
      draftsMap = new Map();
      fileEditor.setPrInfo({ url: result.prUrl, number: result.prNumber, state: 'draft' });
      fileEditor.setStatusText(`Published ${result.files.length} file(s) ✓`);
      setTimeout(() => fileEditor.setStatusText(''), 2500);
      toast.showToast(`Published ${result.files.length} file(s)`, 'success');
      // Reload the open file from the new draft branch so originalContent matches the commit.
      if (fileEditor.filePath && result.files.includes(fileEditor.filePath)) {
        try {
          await fileEditor.openFile(fileEditor.filePath, result.branchName);
        } catch {
          // tolerate reload failure
        }
      }
      if (virtualTree.length) {
        await loadCmsTree(result.branchName);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fileEditor.setStatusText('');
      toast.showToast(msg, 'error');
    }
  }

  async function handleDelete() {
    if (!fileEditor.filePath || !fileEditor.fileSha) return;
    if (!window.confirm(`Delete ${fileEditor.filePath}?`)) return;
    const branch = branchesApi.selectedBranch;
    if (!branch) {
      toast.showToast('Publish your edits first to create a draft branch.', 'error');
      return;
    }
    fileEditor.setStatusText('Deleting…');
    const deletedPath = fileEditor.filePath;
    try {
      await fileEditor.deleteFile(branch);
      // Drop any buffered draft for this path.
      Api.deleteDraft(deletedPath).catch(() => {});
      deleteDraftEntry(deletedPath);
      if (virtualTree.length) {
        await loadCmsTree(branch);
      } else {
        await tree.loadTree(branch, tree.dirPath);
      }
      toast.showToast(`Deleted ${deletedPath}`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fileEditor.setStatusText(msg);
      toast.showToast(msg, 'error');
    }
  }

  async function handleMarkReady() {
    const title = window.prompt(
      'Title for review request:',
      `Content update via ${branchesApi.selectedBranch}`,
    );
    if (!title) return;
    try {
      await fileEditor.markPrReady(title, '');
      toast.showToast('Submitted for review', 'success');
    } catch (err) {
      toast.showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  async function onSwitchLocale(locale: string) {
    if (!activeContentKey || !contentGroups.has(activeContentKey)) return;
    const localeMap = contentGroups.get(activeContentKey)!;
    const node = localeMap.get(locale);
    if (node) await handleOpenFile(node.realPath, false);
  }

  const currentLocales = $derived(
    !activeContentKey || !contentGroups.has(activeContentKey)
      ? []
      : [...contentGroups.get(activeContentKey)!.keys()],
  );

  async function handleLogout() {
    await auth.logout();
    sidebarOpen = false;
    focusMode = false;
    branchesApi.selectedBranch = '';
  }

  function setFocusMode(next: boolean) {
    focusMode = next;
  }
</script>

{#if auth.state.kind === 'loading'}
  <!-- nothing -->
{:else if auth.state.kind === 'unauthenticated'}
  <LoginScreen />
{:else if auth.state.kind === 'tenant-select'}
  <TenantPickerScreen
    tenants={auth.state.tenants}
    onSelect={(slug) => auth.selectTenant(slug)}
    onLogout={() => auth.logout()}
  />
{:else}
  <div id="screen-app" class="screen app-screen">
    <AppTopbar
      repo={auth.repo}
      branches={branchesApi.branches}
      selectedBranch={branchesApi.selectedBranch}
      onSelectBranch={handleSelectBranch}
      {focusMode}
      onToggleFocus={() => (focusMode = !focusMode)}
      onToggleSidebar={() => (sidebarOpen = !sidebarOpen)}
      {sidebarOpen}
      fileOpen={fileEditor.fileOpen}
      {canSave}
      onSave={() => handleSave().catch(() => {})}
      showToast={toast.showToast}
    />

    <div class="app-body">
      <Sidebar
        repo={auth.repo}
        user={auth.user}
        branch={branchesApi.selectedBranch}
        files={tree.files}
        dirPath={tree.dirPath}
        activeTreePath={tree.activeTreePath}
        {sidebarOpen}
        {virtualTree}
        onNavigateUp={() => tree.navigateUp(branchesApi.selectedBranch).catch(() => {})}
        onOpenFile={(path, isDir) => {
          handleOpenFile(path, isDir).catch(() => {});
        }}
        {pendingFilePath}
        onNewFile={handleNewFile}
        onLogout={() => {
          handleLogout().catch(() => {});
        }}
      />

      <div
        class="fixed inset-0 z-30 bg-black/35 transition-opacity duration-200 md:hidden {sidebarOpen
          ? 'opacity-100'
          : 'pointer-events-none opacity-0'}"
        aria-hidden={!sidebarOpen}
        onclick={() => (sidebarOpen = false)}
        onkeydown={(e) => {
          if (e.key === 'Escape') sidebarOpen = false;
        }}
        role="presentation"
      ></div>

      <main class="editor-main">
        {#if !fileEditor.fileOpen}
          <div class="no-file-hint">
            <div>
              <p class="text-2xl font-bold tracking-tight">Select a file to edit</p>
              <p class="mt-2 text-sm text-on-surface-variant">
                Choose a branch and file from the left panel.
              </p>
            </div>
          </div>
        {:else}
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
            frontmatterSchema={cmsConfig?.frontmatter?.fields ?? null}
            uploadAsset={uploadAsset}
            linkTargets={() => flatLinkTargets}
            otherEditors={otherEditors}
            onDelete={() => {
              handleDelete().catch(() => {});
            }}
            onMarkReady={() => {
              handleMarkReady().catch(() => {});
            }}
            {focusMode}
            {setFocusMode}
            {previewUrl}
            {currentLocales}
            {activeLocale}
            onSwitchLocale={(locale) => {
              onSwitchLocale(locale).catch(() => {});
            }}
          />
        {/if}
      </main>
    </div>
  </div>
{/if}

<Toast toast={toast.toast} />

<PublishDialog
  open={publishDialog.open}
  drafts={publishDialog.drafts}
  onConfirm={() => {
    handleConfirmPublish().catch(() => {});
  }}
  onCancel={() => (publishDialog = { open: false, drafts: [] })}
/>
