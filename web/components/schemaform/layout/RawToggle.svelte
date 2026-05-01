<script lang="ts">
  let {
    showRaw,
    parseOk,
    onToggle,
  }: {
    showRaw: boolean;
    parseOk: boolean;
    onToggle: (next: boolean) => void;
  } = $props();
</script>

<button
  type="button"
  class="sf-raw-toggle-btn"
  disabled={showRaw && !parseOk}
  onclick={() => onToggle(!showRaw)}
>
  {showRaw ? 'Show form' : 'Show raw YAML'}
</button>
