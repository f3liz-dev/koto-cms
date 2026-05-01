<script lang="ts">
  import type { PrInfo } from '../hooks/useFileEditor.svelte';
  import type { FrontmatterFieldSchema } from '../api';
  import type { LinkTarget } from '../LinkSuggestion';
  import type { PresenceEditor } from '../hooks/useRealtime.svelte';
  import LocaleTabs from './LocaleTabs.svelte';

  const markdownEditorPromise = import('../MarkdownEditor.svelte').then((m) => m.default);

  let {
    filePath,
    fileSha,
    statusText,
    isDirty,
    prInfo,
    isMarkdown,
    draftContent,
    setDraftContent,
    editorKey,
    frontmatterSchema,
    uploadAsset,
    linkTargets,
    otherEditors,
    onDelete,
    onMarkReady,
    setFocusMode,
    previewUrl,
    currentLocales,
    activeLocale,
    onSwitchLocale,
  }: {
    filePath: string;
    fileSha: string | null;
    statusText: string;
    isDirty: boolean;
    prInfo: PrInfo;
    isMarkdown: boolean;
    draftContent: string;
    setDraftContent: (next: string) => void;
    editorKey: string;
    frontmatterSchema: FrontmatterFieldSchema[] | null;
    uploadAsset: ((file: File) => Promise<string>) | null;
    linkTargets: () => LinkTarget[];
    otherEditors: PresenceEditor[];
    onDelete: () => void;
    onMarkReady: () => void;
    focusMode: boolean;
    setFocusMode: (next: boolean) => void;
    previewUrl: string | null;
    currentLocales: string[];
    activeLocale: string | null;
    onSwitchLocale: (locale: string) => void;
  } = $props();
</script>

<div id="editor-pane" class="editor-pane">
  <div class="focus-topbar">
    <div class="flex items-center gap-3">
      <span class="text-xs font-bold uppercase tracking-[0.18em] text-primary">Editor</span>
      <span class="h-4 w-px bg-outline-variant/30"></span>
      <span class="text-sm font-semibold text-on-surface">{filePath}</span>
    </div>
    <div class="flex items-center gap-2">
      <button
        class="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-on-primary"
        onclick={() => setFocusMode(false)}
      >
        <span>Exit</span>
        <span class="material-symbols-outlined text-sm">close</span>
      </button>
    </div>
  </div>

  <div
    id="editor-filebar"
    class="flex flex-wrap items-center justify-between gap-2 bg-surface-container-low/30 px-4 py-3 md:px-8 md:py-4"
  >
    <div class="flex min-w-0 items-center gap-3 md:gap-4">
      <h1 class="truncate text-base font-bold tracking-tight text-on-surface md:text-xl">
        {filePath}
      </h1>
      <span
        class="text-[11px] bg-secondary-container text-on-secondary-container px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter"
      >
        {statusText || (isDirty ? 'Unsaved changes' : '')}
      </span>
      {#if otherEditors.length > 0}
        <span class="presence-pill" title={otherEditors.map((e) => e.handle).join(', ')}>
          <span class="presence-dot"></span>
          {otherEditors.length} other{otherEditors.length === 1 ? '' : 's'} editing
        </span>
      {/if}
    </div>
    <div class="flex items-center gap-2">
      <button
        class="px-3 py-1.5 rounded-lg text-sm font-semibold text-error hover:bg-error/10"
        hidden={!fileSha}
        onclick={onDelete}
      >
        Delete
      </button>
      <button
        class="px-4 py-1.5 rounded-lg text-sm font-semibold bg-secondary-container text-on-secondary-container hover:opacity-90"
        hidden={prInfo.state !== 'draft'}
        onclick={onMarkReady}
      >
        Submit for review
      </button>
    </div>
  </div>

  {#if currentLocales && currentLocales.length > 1}
    <LocaleTabs locales={currentLocales} {activeLocale} onSwitch={onSwitchLocale} />
  {/if}

  <div class="editor-workspace">
    <div class="editor-textarea-wrap writing-canvas custom-scrollbar">
      {#if isMarkdown}
        {#await markdownEditorPromise}
          <div class="editor-skeleton" aria-hidden="true"></div>
        {:then ME}
          <ME
            {editorKey}
            value={draftContent}
            onChange={setDraftContent}
            {frontmatterSchema}
            {uploadAsset}
            {linkTargets}
            currentFilePath={filePath}
          />
        {:catch err}
          <div class="editor-skeleton-error">Editor failed to load: {err.message}</div>
        {/await}
      {:else}
        <textarea
          class="plain-editor"
          value={draftContent}
          oninput={(e) => setDraftContent((e.currentTarget as HTMLTextAreaElement).value)}
          spellcheck={false}
        ></textarea>
      {/if}
    </div>
  </div>

  <footer
    id="editor-footer"
    class="flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant/10 bg-surface-container-lowest px-4 py-3 md:px-8"
  >
    <div
      class="flex items-center gap-2 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest"
      hidden={!prInfo.url}
    >
      <span>PR</span>
      <a
        class="text-primary hover:underline normal-case tracking-normal"
        href={prInfo.url || '#'}
        target="_blank"
        rel="noopener"
      >
        #{prInfo.number ?? '—'}
      </a>
      <span class="pr-state {prInfo.state}">{prInfo.state}</span>
    </div>
    <div class="flex items-center gap-3">
      {#if previewUrl}
        <a
          class="flex items-center gap-1 rounded-lg bg-surface-container-low px-3 py-1.5 text-xs font-semibold text-on-surface hover:bg-surface-container"
          href={previewUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span class="material-symbols-outlined text-sm">open_in_new</span>
          <span>Open Preview</span>
        </a>
      {/if}
      <div class="flex items-center gap-2">
        <span class="material-symbols-outlined text-sm text-secondary icon-filled">
          cloud_done
        </span>
        <span class="text-[10px] font-bold text-secondary uppercase tracking-widest">Synced</span>
      </div>
    </div>
  </footer>
</div>
