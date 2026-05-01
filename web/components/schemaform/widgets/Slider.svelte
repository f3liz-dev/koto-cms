<script lang="ts">
  let {
    value,
    oncommit,
    min = 0,
    max = 100,
    step = 1,
  }: {
    value: number | '';
    oncommit: (v: number) => void;
    min?: number;
    max?: number;
    step?: number;
  } = $props();

  const display = $derived(value === '' ? min : value);
</script>

<div class="sf-slider">
  <input
    type="range"
    class="sf-slider-range"
    value={display}
    {min}
    {max}
    {step}
    oninput={(e) => oncommit(Number((e.currentTarget as HTMLInputElement).value))}
  />
  <span class="sf-slider-value">{display}</span>
</div>
