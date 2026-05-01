<script lang="ts">
  let { value, oncommit }: {
    value: string[];
    oncommit: (v: string[]) => void;
  } = $props();

  let draft = $state('');

  function commitDraft() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (value.includes(trimmed)) {
      draft = '';
      return;
    }
    oncommit([...value, trimmed]);
    draft = '';
  }

  function removeAt(i: number) {
    const next = value.slice();
    next.splice(i, 1);
    oncommit(next);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitDraft();
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      removeAt(value.length - 1);
    }
  }
</script>

<div class="sf-tag-chips">
  {#each value as tag, i (tag + i)}
    <span class="sf-tag-chip">
      <span>{tag}</span>
      <button
        type="button"
        class="sf-tag-chip-remove"
        aria-label={`Remove ${tag}`}
        onclick={() => removeAt(i)}
      >×</button>
    </span>
  {/each}
  <input
    type="text"
    class="sf-tag-chip-input"
    placeholder="Add…"
    value={draft}
    oninput={(e) => (draft = (e.currentTarget as HTMLInputElement).value)}
    onkeydown={onKeydown}
    onblur={commitDraft}
  />
</div>
