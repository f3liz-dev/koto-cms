/**
 * miauth.ts
 *
 * MiAuth bridge — authenticates editors via their Misskey handle,
 * then returns the bot GitHub token with editor identity metadata.
 *
 * Ref: https://misskey-hub.net/en/docs/for-developers/api/token/miauth/
 */

import { getSecrets } from "./server.ts";
import { validateHandle } from "./webfinger.ts";
import { validateAllowlist } from "./allowlist.ts";

export interface MiAuthRequest {
  handle: string;       // e.g. "@user@misskey.io"
  instanceUrl?: string; // optional; derived from handle if omitted
}

export interface MiAuthSession {
  ok: boolean;
  access_token?: string;  // bot GitHub PAT (server-side only)
  author_name?: string;
  author_email?: string;
  fedi_handle?: string;
  error?: string;
}

interface MisskeyUser {
  id: string;
  username: string;
  name: string | null;
  host: string | null;
}

// ── Initiate ───────────────────────────────────────────────────────────────────

export async function initiateMiAuthFlow(
  request: MiAuthRequest,
): Promise<{ sessionUrl: string; sessionId: string }> {
  const { handle, instanceUrl } = request;

  const parsed = validateHandle(handle);
  if (!parsed) throw new Error(`Invalid Fediverse handle: ${handle}`);

  const actualInstanceUrl = instanceUrl ?? `https://${parsed.instance}`;
  const sessionId         = crypto.randomUUID();
  const callbackUrl       = Deno.env.get("MIAUTH_CALLBACK_URL") ?? "http://localhost:3000/miauth/callback";

  const authUrl = new URL(`/miauth/${sessionId}`, actualInstanceUrl);
  authUrl.searchParams.set("name", Deno.env.get("APP_NAME") ?? "Koto");
  authUrl.searchParams.set("callback", callbackUrl);
  authUrl.searchParams.set("permission", "read:account");

  return { sessionUrl: authUrl.toString(), sessionId };
}

// ── Callback ───────────────────────────────────────────────────────────────────

export async function handleMiAuthCallback(
  sessionId: string,
  instanceUrl: string,
): Promise<MiAuthSession> {
  try {
    // Verify session with the Misskey instance
    const checkRes = await fetch(
      new URL(`/api/miauth/${sessionId}/check`, instanceUrl).toString(),
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) },
    );

    if (!checkRes.ok) {
      return { ok: false, error: `MiAuth check failed: ${checkRes.statusText}` };
    }

    const checkData = (await checkRes.json()) as {
      token?: string;
      user?: MisskeyUser;
    };

    if (!checkData.user) return { ok: false, error: "User not authenticated" };

    const user         = checkData.user;
    const miAuthToken  = checkData.token;
    const instance     = user.host ?? new URL(instanceUrl).hostname;
    const fediHandle   = `@${user.username}@${instance}`;

    // Allowlist check (early reject before fetching profile)
    if (!(await validateAllowlist(fediHandle))) {
      return { ok: false, error: `Editor ${fediHandle} is not in the allowlist` };
    }

    // Fetch full profile for display name
    let displayName = user.name ?? user.username;
    try {
      const profileRes = await fetch(
        new URL("/api/users/show", instanceUrl).toString(),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: user.username, host: user.host, i: miAuthToken }),
        },
      );
      if (profileRes.ok) {
        const profile = (await profileRes.json()) as MisskeyUser;
        displayName = profile.name ?? profile.username;
      }
    } catch { /* non-fatal — fall back to basic name */ }

    const githubToken = getSecrets().githubBotToken;
    if (!githubToken) return { ok: false, error: "Bot GitHub token not configured" };

    return {
      ok:           true,
      access_token: githubToken,
      author_name:  displayName,
      author_email: `${user.username}+${instance}@users.noreply.fediverse`,
      fedi_handle:  fediHandle,
    };
  } catch (err) {
    return { ok: false, error: `MiAuth error: ${err instanceof Error ? err.message : String(err)}` };
  }
}
