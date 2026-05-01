<script lang="ts">
  import { Api } from '../api';

  let handle = $state('');
  let loginBusy = $state(false);
  let loginError = $state('');

  async function onLogin(e: SubmitEvent) {
    e.preventDefault();
    if (!handle.trim()) return;
    loginBusy = true;
    loginError = '';
    try {
      const result = await Api.loginInit(handle.trim());
      const sessionUrl = (result as { sessionUrl?: string }).sessionUrl;
      if (sessionUrl) {
        window.location.assign(sessionUrl);
      } else {
        loginError = 'No sessionUrl returned';
        loginBusy = false;
      }
    } catch (err) {
      loginError = err instanceof Error ? err.message : String(err);
      loginBusy = false;
    }
  }
</script>

<div id="screen-login" class="screen login-screen">
  <div
    class="w-full max-w-md rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-8 shadow-sm"
  >
    <div class="mb-8 text-center">
      <p class="text-xs uppercase tracking-[0.2em] text-on-surface-variant">Koto</p>
      <h1 class="mt-2 text-3xl font-extrabold tracking-tight">Sign in</h1>
      <p class="mt-2 text-sm text-on-surface-variant">Use your Fediverse handle to continue.</p>
    </div>
    <form autocomplete="off" class="space-y-4" onsubmit={onLogin}>
      <label
        for="login-handle"
        class="block text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant"
      >
        Handle
      </label>
      <div class="flex gap-2">
        <input
          id="login-handle"
          class="flex-1 rounded-lg border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:ring-primary"
          type="text"
          bind:value={handle}
          placeholder="@you@misskey.io"
          spellcheck={false}
          required
          disabled={loginBusy}
        />
        <button
          type="submit"
          class="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-on-primary disabled:opacity-50"
          disabled={loginBusy}
        >
          {loginBusy ? '...' : 'Sign in'}
        </button>
      </div>
      {#if loginError}
        <p class="text-xs font-semibold text-error">{loginError}</p>
      {/if}
    </form>
  </div>
</div>
