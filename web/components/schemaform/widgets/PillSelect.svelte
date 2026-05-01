<script lang="ts">
  let {
    value,
    options,
    oncommit,
  }: {
    value: string;
    options: string[];
    oncommit: (v: string) => void;
  } = $props();

  const displayOptions = $derived(options.map(String));
  const displayValue = $derived(String(value ?? ''));
</script>

<div class="sf-pill-group" role="radiogroup">
  {#each displayOptions as opt (opt)}
    <button
      type="button"
      class="sf-pill"
      class:sf-pill-active={displayValue === opt}
      role="radio"
      aria-checked={displayValue === opt}
      onclick={() => oncommit(opt)}
    >
      {opt}
    </button>
  {/each}
</div>
