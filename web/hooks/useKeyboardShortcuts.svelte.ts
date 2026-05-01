export interface KeyboardShortcutsOptions {
  onSave: () => void;
  onEscape: () => void;
  canSave: () => boolean;
  focusMode: () => boolean;
}

export function useKeyboardShortcuts(opts: KeyboardShortcutsOptions): void {
  $effect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && opts.focusMode()) {
        e.preventDefault();
        opts.onEscape();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'Enter')) {
        e.preventDefault();
        if (opts.canSave()) opts.onSave();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  });
}
