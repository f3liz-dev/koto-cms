<script lang="ts">
  let {
    value,
    oncommit,
    label = 'Toggle',
  }: {
    value: boolean;
    oncommit: (v: boolean) => void;
    label?: string;
  } = $props();
</script>

<button
  type="button"
  class="sf-toggle"
  class:sf-toggle-on={value}
  role="switch"
  aria-checked={value}
  aria-label={label}
  onclick={() => oncommit(!value)}
>
  <span class="sf-toggle-thumb"></span>
</button>
