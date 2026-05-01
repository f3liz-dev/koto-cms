import { KotoCmsDO } from './do';
import { extractTenantSlug, listTenants, loadTenant } from './config';
import {
  createGatewaySession,
  gatewaySessionCookie,
  tenantSelectionCookie,
  verifyGatewaySession,
} from './gateway-session';
import { isAllowed } from './allowlist';
import { parseCookies, buildCookie } from './cookies';
import { applySecureHeaders } from './cors';
import {
  handleCallback as miauthHandleCallback,
  initiateFlow as miauthInitiateFlow,
  instanceOriginForHandle,
  MiauthError,
} from './miauth';
import type { GatewayClaims, TenantConfig, WorkerEnv } from './types';

export { KotoCmsDO };

const JSON_HEADERS = { 'Content-Type': 'application/json' };

const TENANT_API_PREFIXES = ['/api/', '/t/', '/tenants/'];

function isApiRequest(pathname: string): boolean {
  if (pathname === '/health') return true;
  if (pathname.startsWith('/auth/')) return true;
  if (pathname.startsWith('/miauth/')) return true;
  return TENANT_API_PREFIXES.some((p) => pathname.startsWith(p));
}

function json(body: unknown, status = 200, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extra },
  });
}

function error(message: string, status: number): Response {
  return json({ error: message }, status);
}

function gatewayCallbackUrl(req: Request): string {
  const u = new URL(req.url);
  return `${u.origin}/miauth/callback`;
}

function appName(env: WorkerEnv): string {
  return env.APP_NAME ?? 'Koto';
}

async function readSession(
  req: Request,
  env: WorkerEnv,
): Promise<GatewayClaims | null> {
  const cookies = parseCookies(req.headers.get('cookie'));
  const token = cookies.koto_session;
  if (!token) return null;
  return verifyGatewaySession(env.GATEWAY_SECRET, token);
}

function tenantsForHandle(env: WorkerEnv, handle: string): TenantConfig[] {
  return listTenants(env).filter((t) => isAllowed(t, handle));
}

export default {
  async fetch(req: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method.toUpperCase();

    if (!isApiRequest(path)) {
      return env.ASSETS.fetch(req);
    }

    try {
      // Gateway routes — handled by the worker, no DO needed.
      if (method === 'GET' && path === '/auth/login') {
        return applySecureHeaders(await handleLogin(req, env));
      }
      if (method === 'GET' && path === '/miauth/callback') {
        return applySecureHeaders(await handleCallback(req, env));
      }
      if (method === 'POST' && path === '/auth/logout') {
        return applySecureHeaders(handleLogout());
      }
      if (method === 'GET' && path === '/api/me') {
        return applySecureHeaders(await handleMe(req, env));
      }
      if (method === 'PATCH' && path === '/api/me') {
        return applySecureHeaders(await handleUpdateMe(req, env));
      }
      if (method === 'GET' && path === '/api/tenants') {
        return applySecureHeaders(await handleListTenants(req, env));
      }
      if (method === 'POST' && path === '/api/tenant/select') {
        return applySecureHeaders(await handleSelectTenant(req, env));
      }
      if (method === 'GET' && path === '/api/bootstrap') {
        return applySecureHeaders(await handleBootstrap(req, env));
      }

      // Health route — no auth, no tenant.
      if (method === 'GET' && path === '/health') {
        return applySecureHeaders(json({ ok: true, ts: Math.floor(Date.now() / 1000) }));
      }

      // All other API calls require a session AND a resolved tenant.
      const session = await readSession(req, env);
      if (!session) return applySecureHeaders(error('Unauthorized', 401));

      const slug = extractTenantSlug(req);
      if (!slug) return applySecureHeaders(error('Tenant not selected', 404));

      const tenant = loadTenant(env, slug);
      if (!tenant) return applySecureHeaders(error('Tenant not configured', 404));

      if (!isAllowed(tenant, session.fedi_handle)) {
        return applySecureHeaders(error('Forbidden', 403));
      }

      const id = env.KOTO_DO.idFromName(slug);
      const stub = env.KOTO_DO.get(id, { locationHint: 'apac' });
      const forwarded = forwardToDO(req, slug, session);
      return stub.fetch(forwarded);
    } catch (err) {
      if (err instanceof MiauthError) {
        return applySecureHeaders(error(err.message, 400));
      }
      const msg = err instanceof Error ? err.message : String(err);
      return applySecureHeaders(error(msg, 500));
    }
  },
};

function forwardToDO(req: Request, slug: string, session: GatewayClaims): Request {
  const headers = new Headers(req.headers);
  headers.set('x-koto-repo', slug);
  headers.set('x-koto-fedi-handle', session.fedi_handle);
  headers.set('x-koto-author-name', session.author_name);
  headers.set('x-koto-author-email', session.custom_email || session.author_email);
  return new Request(req, { headers });
}

async function handleLogin(req: Request, env: WorkerEnv): Promise<Response> {
  const handle = new URL(req.url).searchParams.get('handle');
  if (!handle) return error('Invalid handle', 400);

  const result = miauthInitiateFlow({
    handle,
    appName: appName(env),
    callbackUrl: gatewayCallbackUrl(req),
  });
  const instanceUrl = instanceOriginForHandle(handle);
  const cookie = buildCookie('miauth_origin', instanceUrl, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    maxAge: 300,
  });
  return json(result, 200, { 'Set-Cookie': cookie });
}

async function handleCallback(req: Request, env: WorkerEnv): Promise<Response> {
  const sessionId = new URL(req.url).searchParams.get('session');
  if (!sessionId) return error('Auth session expired or invalid origin', 400);

  const cookies = parseCookies(req.headers.get('cookie'));
  const pinned = cookies.miauth_origin;
  if (!pinned) return error('Auth session expired or invalid origin', 400);

  const mi = await miauthHandleCallback(sessionId, pinned);
  const token = await createGatewaySession(env.GATEWAY_SECRET, env.GATEWAY_TTL_HOURS, {
    fedi_handle: mi.fedi_handle,
    author_name: mi.author_name,
    author_email: mi.author_email,
  });

  const headers = new Headers({ Location: '/' });
  headers.append('Set-Cookie', buildCookie('miauth_origin', '', { maxAge: 0, secure: true }));
  headers.append('Set-Cookie', gatewaySessionCookie(token, env.GATEWAY_TTL_HOURS));
  return new Response(null, { status: 302, headers });
}

function handleLogout(): Response {
  const headers = new Headers(JSON_HEADERS);
  headers.append('Set-Cookie', gatewaySessionCookie('', undefined, true));
  headers.append('Set-Cookie', tenantSelectionCookie('', true));
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

async function handleMe(req: Request, env: WorkerEnv): Promise<Response> {
  const session = await readSession(req, env);
  if (!session) return error('Unauthorized', 401);
  return json({
    fedi_handle: session.fedi_handle,
    author_name: session.author_name,
    author_email: session.author_email,
    custom_email: session.custom_email ?? null,
  });
}

async function handleUpdateMe(req: Request, env: WorkerEnv): Promise<Response> {
  const session = await readSession(req, env);
  if (!session) return error('Unauthorized', 401);
  const body = (await req.json().catch(() => ({}))) as { custom_email?: string };
  const email = (body.custom_email ?? '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return error('Invalid email format', 400);
  }
  const newToken = await createGatewaySession(
    env.GATEWAY_SECRET,
    env.GATEWAY_TTL_HOURS,
    {
      fedi_handle: session.fedi_handle,
      author_name: session.author_name,
      author_email: session.author_email,
      custom_email: email,
    },
  );
  return json({ ok: true }, 200, {
    'Set-Cookie': gatewaySessionCookie(newToken, env.GATEWAY_TTL_HOURS),
  });
}

async function handleListTenants(req: Request, env: WorkerEnv): Promise<Response> {
  const session = await readSession(req, env);
  if (!session) return error('Unauthorized', 401);
  const tenants = tenantsForHandle(env, session.fedi_handle).map((t) => ({
    slug: t.repo,
    repo: t.repo,
  }));
  return json(tenants);
}

async function handleSelectTenant(req: Request, env: WorkerEnv): Promise<Response> {
  const session = await readSession(req, env);
  if (!session) return error('Unauthorized', 401);
  const body = (await req.json().catch(() => ({}))) as { slug?: string };
  const slug = body.slug;
  if (!slug || !/^[^/]+\/[^/]+$/.test(slug)) return error('Invalid slug', 400);
  const tenant = loadTenant(env, slug);
  if (!tenant) return error('Tenant not configured', 404);
  if (!isAllowed(tenant, session.fedi_handle)) return error('Forbidden', 403);
  return json({ ok: true }, 200, { 'Set-Cookie': tenantSelectionCookie(slug) });
}

async function handleBootstrap(req: Request, env: WorkerEnv): Promise<Response> {
  const session = await readSession(req, env);
  if (!session) return json({ kind: 'unauthenticated' });

  let slug = extractTenantSlug(req);
  let pickedAutoCookie: string | null = null;

  if (!slug) {
    const tenants = tenantsForHandle(env, session.fedi_handle);
    if (tenants.length === 0) return json({ kind: 'unauthenticated' });
    if (tenants.length === 1) {
      slug = tenants[0].repo;
      pickedAutoCookie = tenantSelectionCookie(slug);
    } else {
      return json({
        kind: 'tenant-select',
        user: {
          fedi_handle: session.fedi_handle,
          author_name: session.author_name,
          author_email: session.author_email,
        },
        tenants: tenants.map((t) => ({ slug: t.repo, repo: t.repo })),
      });
    }
  }

  const tenant = loadTenant(env, slug);
  if (!tenant) return error('Tenant not configured', 404);
  if (!isAllowed(tenant, session.fedi_handle)) return error('Forbidden', 403);

  const id = env.KOTO_DO.idFromName(slug);
  const stub = env.KOTO_DO.get(id, { locationHint: 'apac' });
  const forwarded = forwardToDO(req, slug, session);
  const doResponse = await stub.fetch(forwarded);

  if (pickedAutoCookie && doResponse.ok) {
    const headers = new Headers(doResponse.headers);
    headers.append('Set-Cookie', pickedAutoCookie);
    return new Response(doResponse.body, {
      status: doResponse.status,
      statusText: doResponse.statusText,
      headers,
    });
  }
  return doResponse;
}
