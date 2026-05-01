<script lang="ts">
  let { value, oncommit }: {
    value: string;
    oncommit: (v: string) => void;
  } = $props();
</script>

<input
  type="date"
  class="sf-input"
  {value}
  oninput={(e) => oncommit((e.currentTarget as HTMLInputElement).value)}
/>
