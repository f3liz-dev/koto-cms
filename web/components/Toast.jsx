export function Toast({ toast }) {
  return (
    <div class={`toast ${toast.type} ${toast.visible ? "show" : ""}`} hidden={!toast.msg}>
      {toast.msg}
    </div>
  );
}
