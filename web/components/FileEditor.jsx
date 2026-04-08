import { MarkdownEditor } from "../MarkdownEditor.jsx";
import { PreviewPane } from "./PreviewPane.jsx";
import { LocaleTabs } from "./LocaleTabs.jsx";

export function FileEditor({
  filePath,
  fileSha,
  statusText,
  isDirty,
  prInfo,
  isMarkdown,
  isPreviewable,
  draftContent,
  setDraftContent,
  editorKey,
  onSyncPoint,
  onDelete,
  onMarkReady,
  focusMode,
  setFocusMode,
  previewTab,
  setPreviewTab,
  previewFrameRef,
  previewResult,
  initialScrollY,
  onPreviewScrollY,
  currentLocales,
  activeLocale,
  onSwitchLocale,
}) {
  return (
    <div id="editor-pane" class="editor-pane">
      <div class="focus-topbar">
        <div class="flex items-center gap-3">
          <span class="text-xs font-bold uppercase tracking-[0.18em] text-primary">Editor</span>
          <span class="h-4 w-px bg-outline-variant/30" />
          <span class="text-sm font-semibold text-on-surface">{filePath}</span>
        </div>
        <div class="flex items-center gap-2">
          {isPreviewable ? (
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
          <span class="text-[11px] bg-secondary-container text-on-secondary-container px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter">
            {statusText || (isDirty ? "Unsaved changes" : "")}
          </span>
        </div>
        <div class="flex items-center gap-2">
          <button class="px-3 py-1.5 rounded-lg text-sm font-semibold text-error hover:bg-error/10" hidden={!fileSha} onClick={onDelete}>
            Delete
          </button>
          <button class="px-4 py-1.5 rounded-lg text-sm font-semibold bg-secondary-container text-on-secondary-container hover:opacity-90" hidden={prInfo.state !== "draft"} onClick={onMarkReady}>
            Mark PR Ready
          </button>
        </div>
      </div>

      {currentLocales?.length > 1 ? (
        <LocaleTabs locales={currentLocales} activeLocale={activeLocale} onSwitch={onSwitchLocale} />
      ) : null}

      <div class={`editor-workspace${isPreviewable && !focusMode ? " has-preview" : ""}`}>
        <div class="editor-textarea-wrap writing-canvas custom-scrollbar">
          {isMarkdown ? (
            <MarkdownEditor
              editorKey={editorKey}
              value={draftContent}
              onChange={setDraftContent}
              onSyncPoint={onSyncPoint}
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
        {isPreviewable && !focusMode ? (
          <PreviewPane 
            frameRef={previewFrameRef} 
            previewResult={previewResult} 
            initialScrollY={initialScrollY} 
            onScrollY={onPreviewScrollY} 
          />
        ) : null}
      </div>

      <footer id="editor-footer" class="flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant/10 bg-surface-container-lowest px-4 py-3 md:px-8">
        <div class="flex items-center gap-2 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest" hidden={!prInfo.url}>
          <span>PR</span>
          <a class="text-primary hover:underline normal-case tracking-normal" href={prInfo.url || "#"} target="_blank" rel="noopener">
            #{prInfo.number ?? "—"}
          </a>
          <span class={`pr-state ${prInfo.state}`}>{prInfo.state}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-sm text-secondary icon-filled">cloud_done</span>
          <span class="text-[10px] font-bold text-secondary uppercase tracking-widest">Synced</span>
        </div>
      </footer>
    </div>
  );
}
