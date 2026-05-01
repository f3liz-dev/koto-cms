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

  let query = $state('');
  let open = $state(false);

  const filtered = $derived(
    query.trim() === ''
      ? displayOptions
      : displayOptions.filter((o) => o.toLowerCase().includes(query.toLowerCase())),
  );

  function pick(opt: string) {
    oncommit(opt);
    query = '';
    open = false;
  }
</script>

<div class="sf-search-select">
  <input
    type="text"
    class="sf-input"
    value={open ? query : displayValue}
    placeholder={open ? 'Search…' : ''}
    onfocus={() => (open = true)}
    onblur={() => setTimeout(() => (open = false), 120)}
    oninput={(e) => {
      query = (e.currentTarget as HTMLInputElement).value;
      open = true;
    }}
  />
  {#if open && filtered.length > 0}
    <ul class="sf-search-menu" role="listbox">
      {#each filtered as opt (opt)}
        <li>
          <button
            type="button"
            class="sf-search-option"
            class:sf-search-option-active={displayValue === opt}
            onmousedown={(e) => {
              e.preventDefault();
              pick(opt);
            }}
          >
            {opt}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
