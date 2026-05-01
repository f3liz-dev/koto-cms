<script lang="ts">
  import type { DraftEntry } from '../api';

  let {
    open,
    drafts,
    onConfirm,
    onCancel,
  }: {
    open: boolean;
    drafts: DraftEntry[];
    onConfirm: () => void;
    onCancel: () => void;
  } = $props();

  function formatAge(ts: number): string {
    const secs = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (secs < 60) return `${secs}s ago`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    return `${Math.floor(secs / 3600)}h ago`;
  }
</script>

{#if open}
  <div
    class="conflict-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="publish-title"
  >
    <div class="conflict-card publish-card">
      <h2 id="publish-title" class="conflict-title">
        Publish {drafts.length} file{drafts.length === 1 ? '' : 's'}?
      </h2>
      <p class="conflict-body">
        These edits will be committed to the draft branch on GitHub.
      </p>
      <ul class="publish-list">
        {#each drafts as d (d.path)}
          <li class="publish-item">
            <span class="publish-status">{d.sha ? 'edit' : 'new'}</span>
            <span class="publish-path">{d.path}</span>
            <span class="publish-age">{formatAge(d.savedAt)}</span>
          </li>
        {/each}
      </ul>
      <div class="conflict-actions">
        <button class="conflict-btn conflict-btn-primary" onclick={onConfirm}>
          Publish to GitHub
        </button>
        <button class="conflict-btn conflict-btn-ghost" onclick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .publish-card {
    max-width: 540px;
  }
  .publish-list {
    margin: 0.75rem 0 1rem;
    padding: 0.5rem;
    list-style: none;
    border: 1px solid rgba(176, 178, 176, 0.4);
    border-radius: 0.5rem;
    background: rgba(244, 244, 241, 0.6);
    max-height: 280px;
    overflow-y: auto;
  }
  .publish-item {
    display: grid;
    grid-template-columns: 3rem 1fr auto;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.5rem;
    font-size: 0.85rem;
    border-radius: 0.35rem;
  }
  .publish-item + .publish-item {
    border-top: 1px solid rgba(176, 178, 176, 0.25);
  }
  .publish-status {
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #5d605e;
    text-align: center;
  }
  .publish-path {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .publish-age {
    font-size: 0.7rem;
    color: #5d605e;
  }
</style>
