import { useState } from "preact/hooks";
import { Api } from "../api.js";

export function LoginScreen() {
  const [handle, setHandle] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState("");

  const onLogin = async (e) => {
    e.preventDefault();
    if (!handle.trim()) return;
    setLoginBusy(true);
    setLoginError("");
    try {
      const { sessionUrl } = await Api.loginInit(handle.trim());
      window.location.assign(sessionUrl);
    } catch (err) {
      setLoginError(err.message);
      setLoginBusy(false);
    }
  };

  return (
    <div id="screen-login" class="screen login-screen">
      <div class="w-full max-w-md rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-8 shadow-sm">
        <div class="mb-8 text-center">
          <p class="text-xs uppercase tracking-[0.2em] text-on-surface-variant">Koto</p>
          <h1 class="mt-2 text-3xl font-extrabold tracking-tight">Sign in</h1>
          <p class="mt-2 text-sm text-on-surface-variant">Use your Fediverse handle to continue.</p>
        </div>
        <form autocomplete="off" class="space-y-4" onSubmit={onLogin}>
          <label class="block text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant">
            Handle
          </label>
          <div class="flex gap-2">
            <input
              class="flex-1 rounded-lg border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:ring-primary"
              type="text"
              value={handle}
              onInput={(e) => setHandle(e.currentTarget.value)}
              placeholder="@you@misskey.io"
              spellcheck={false}
              required
              disabled={loginBusy}
            />
            <button type="submit" class="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-on-primary disabled:opacity-50" disabled={loginBusy}>
              {loginBusy ? "..." : "Sign in"}
            </button>
          </div>
          {loginError ? <p class="text-xs font-semibold text-error">{loginError}</p> : null}
        </form>
      </div>
    </div>
  );
}
