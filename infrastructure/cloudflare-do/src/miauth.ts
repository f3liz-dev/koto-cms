export interface MiauthInitResult {
  sessionUrl: string;
  sessionId: string;
}

export interface MiauthUser {
  username: string;
  host?: string;
  name?: string;
}

export interface MiauthCallbackResult {
  ok: true;
  author_name: string;
  author_email: string;
  fedi_handle: string;
}

export class MiauthError extends Error {}

function validateHandle(handle: string): { username: string; instance: string } {
  const normalized = handle.replace(/^@/, '');
  const [username, instance] = normalized.split('@');
  if (!username || !instance) {
    throw new MiauthError('Invalid handle format');
  }
  if (!instance.includes('.') && instance !== 'localhost') {
    throw new MiauthError('Invalid instance domain');
  }
  return { username, instance };
}

export function initiateFlow(opts: {
  handle: string;
  appName: string;
  callbackUrl: string;
}): MiauthInitResult {
  const { instance } = validateHandle(opts.handle);
  if (!opts.callbackUrl) {
    throw new MiauthError('callbackUrl not configured');
  }
  const sessionId = crypto.randomUUID();
  const params = new URLSearchParams({
    name: opts.appName,
    callback: opts.callbackUrl,
    permission: 'read:account',
  });
  const sessionUrl = `https://${instance}/miauth/${sessionId}?${params.toString()}`;
  return { sessionUrl, sessionId };
}

export function instanceOriginForHandle(handle: string): string {
  const { instance } = validateHandle(handle);
  return `https://${instance}`;
}

export async function handleCallback(
  sessionId: string,
  instanceUrl: string,
): Promise<MiauthCallbackResult> {
  const checkUrl = `${instanceUrl}/api/miauth/${sessionId}/check`;
  const checkRes = await fetch(checkUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!checkRes.ok) {
    throw new MiauthError(`MiAuth check failed: ${checkRes.status}`);
  }
  const data = (await checkRes.json()) as {
    user?: MiauthUser;
    token?: string;
  };
  if (!data.user) throw new MiauthError('User not authenticated');

  const miToken = data.token ?? '';
  const parsedHost = new URL(instanceUrl).host;
  const instance = data.user.host ?? parsedHost;
  const fediHandle = `@${data.user.username}@${instance}`;
  const displayName = await fetchDisplayName(data.user, instanceUrl, miToken);

  return {
    ok: true,
    author_name: displayName,
    author_email: `${data.user.username}+${instance}@users.noreply.fediverse`,
    fedi_handle: fediHandle,
  };
}

async function fetchDisplayName(
  user: MiauthUser,
  instanceUrl: string,
  miToken: string,
): Promise<string> {
  const profileUrl = `${instanceUrl}/api/users/show`;
  try {
    const res = await fetch(profileUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: user.username,
        host: user.host ?? null,
        i: miToken,
      }),
    });
    if (!res.ok) return user.name ?? user.username;
    const profile = (await res.json()) as { name?: string };
    return profile.name || user.name || user.username;
  } catch {
    return user.name ?? user.username;
  }
}
