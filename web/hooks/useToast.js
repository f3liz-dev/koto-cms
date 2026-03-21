import { useState, useCallback } from "preact/hooks";

export function useToast() {
  const [toast, setToast] = useState({ msg: "", type: "", visible: false });

  const showToast = useCallback((msg, type = "") => {
    setToast({ msg, type, visible: true });
    setTimeout(() => setToast((prev) => ({ ...prev, visible: false })), 3000);
  }, []);

  return { toast, showToast };
}
