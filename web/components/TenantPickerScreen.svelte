<script lang="ts">
  import type { TenantSummary } from '../api';

  interface Props {
    tenants: TenantSummary[];
    onSelect: (slug: string) => Promise<void> | void;
    onLogout: () => Promise<void> | void;
  }

  const { tenants, onSelect, onLogout }: Props = $props();

  let busySlug = $state<string | null>(null);
  let pickError = $state('');

  async function pick(slug: string) {
    busySlug = slug;
    pickError = '';
    try {
      await onSelect(slug);
    } catch (err) {
      pickError = err instanceof Error ? err.message : String(err);
      busySlug = null;
    }
  }
</script>

<div id="screen-tenant" class="screen login-screen">
  <div
    class="w-full max-w-md rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-8 shadow-sm"
  >
    <div class="mb-6 text-center">
      <p class="text-xs uppercase tracking-[0.2em] text-on-surface-variant">Koto</p>
      <h1 class="mt-2 text-3xl font-extrabold tracking-tight">Pick a workspace</h1>
      <p class="mt-2 text-sm text-on-surface-variant">
        Choose which repository to edit.
      </p>
    </div>

    <ul class="space-y-2">
      {#each tenants as t (t.slug)}
        <li>
          <button
            type="button"
            class="flex w-full items-center justify-between rounded-lg border border-outline-variant/40 bg-surface-container-low px-4 py-3 text-left text-sm hover:border-primary disabled:opacity-50"
            disabled={busySlug !== null}
            onclick={() => pick(t.slug)}
          >
            <span class="font-mono">{t.repo}</span>
            <span class="text-xs text-on-surface-variant">
              {busySlug === t.slug ? 'Opening…' : 'Open →'}
            </span>
          </button>
        </li>
      {/each}
    </ul>

    {#if pickError}
      <p class="mt-3 text-xs font-semibold text-error">{pickError}</p>
    {/if}

    <div class="mt-6 flex justify-center">
      <button
        type="button"
        class="text-xs text-on-surface-variant underline disabled:opacity-50"
        disabled={busySlug !== null}
        onclick={() => onLogout()}
      >
        Sign out
      </button>
    </div>
  </div>
</div>
