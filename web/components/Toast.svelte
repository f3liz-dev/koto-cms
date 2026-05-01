<script lang="ts">
  import type { ToastState } from '../hooks/useToast.svelte';

  let { toast }: { toast: ToastState } = $props();
</script>

<div class="toast {toast.type} {toast.visible ? 'show' : ''}" hidden={!toast.msg}>
  {toast.msg}
</div>
