import { useEffect } from "preact/hooks";

export function useKeyboardShortcuts({ onSave, onEscape, canSave, focusMode }) {
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape" && focusMode) {
        e.preventDefault();
        onEscape();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "s" || e.key === "Enter")) {
        e.preventDefault();
        if (canSave) onSave();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onSave, onEscape, canSave, focusMode]);
}
