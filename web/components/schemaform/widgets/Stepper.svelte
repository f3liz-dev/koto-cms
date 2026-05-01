<script lang="ts">
  let {
    value,
    oncommit,
    min,
    max,
    step = 1,
  }: {
    value: number | '';
    oncommit: (v: number) => void;
    min?: number;
    max?: number;
    step?: number;
  } = $props();

  const current = $derived(value === '' ? 0 : value);

  function clamp(n: number): number {
    if (min !== undefined && n < min) return min;
    if (max !== undefined && n > max) return max;
    return n;
  }
</script>

<div class="sf-stepper">
  <button
    type="button"
    class="sf-stepper-btn"
    onclick={() => oncommit(clamp(current - step))}
    aria-label="Decrement"
  >−</button>
  <input
    type="number"
    class="sf-input sf-stepper-input"
    value={current}
    {min}
    {max}
    {step}
    oninput={(e) => {
      const raw = (e.currentTarget as HTMLInputElement).value;
      if (raw === '') return;
      const n = Number(raw);
      if (Number.isFinite(n)) oncommit(clamp(n));
    }}
  />
  <button
    type="button"
    class="sf-stepper-btn"
    onclick={() => oncommit(clamp(current + step))}
    aria-label="Increment"
  >+</button>
</div>
