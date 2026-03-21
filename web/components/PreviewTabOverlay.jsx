import { PreviewPane } from "./PreviewPane.jsx";

export function PreviewTabOverlay({ 
  filePath, 
  previewFrameRef, 
  previewResult, 
  initialScrollY, 
  onPreviewScrollY, 
  onClose 
}) {
  return (
    <div class="preview-tab-overlay">
      <div class="preview-tab-container">
        <div class="preview-tab-header">
          <div class="flex items-center gap-3">
            <span class="text-xs font-bold uppercase tracking-[0.18em] text-primary">Preview</span>
            <span class="h-4 w-px bg-outline-variant/30" />
            <span class="text-sm font-semibold text-on-surface">{filePath}</span>
          </div>
          <button class="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-on-primary" onClick={onClose}>
            <span>Close</span>
            <span class="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
        <div class="preview-tab-content">
          <PreviewPane 
            frameRef={previewFrameRef} 
            previewResult={previewResult} 
            initialScrollY={initialScrollY} 
            onScrollY={onPreviewScrollY} 
          />
        </div>
      </div>
    </div>
  );
}
