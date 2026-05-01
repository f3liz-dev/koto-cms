import type { TenantConfig, WorkerEnv } from './types';
import { parseCookies } from './cookies';

/**
 * Look up tenant configuration from WorkerEnv.TENANTS (a JSON map).
 * Returns null if the tenant is not configured.
 */
export function loadTenant(env: WorkerEnv, slug: string): TenantConfig | null {
  if (!slug) return null;
  let map: Record<string, Partial<TenantConfig>> = {};
  try {
    map = JSON.parse(env.TENANTS ?? '{}') as Record<string, Partial<TenantConfig>>;
  } catch {
    return null;
  }
  const raw = map[slug];
  if (!raw) return null;

  const githubToken = raw.githubToken?.trim();
  if (!githubToken) return null;

  return {
    repo: slug,
    githubToken,
    documentEditors: raw.documentEditors ?? '',
    defaultBranch: raw.defaultBranch ?? env.DEFAULT_BRANCH ?? 'main',
  };
}

/**
 * List every tenant configured in env.TENANTS that doesn't fail validation.
 * Used by the gateway tenant picker to show available repos to a logged-in user.
 */
export function listTenants(env: WorkerEnv): TenantConfig[] {
  let map: Record<string, Partial<TenantConfig>> = {};
  try {
    map = JSON.parse(env.TENANTS ?? '{}') as Record<string, Partial<TenantConfig>>;
  } catch {
    return [];
  }
  const out: TenantConfig[] = [];
  for (const slug of Object.keys(map)) {
    const t = loadTenant(env, slug);
    if (t) out.push(t);
  }
  return out;
}

/**
 * Extract the tenant slug ("owner/repo") from an incoming edge request.
 * Priority: X-Koto-Repo header → /t/owner/repo path → owner--repo subdomain →
 * koto_tenant cookie.
 */
export function extractTenantSlug(req: Request): string | null {
  const headerSlug = req.headers.get('x-koto-repo');
  if (headerSlug && /^[^/]+\/[^/]+$/.test(headerSlug)) return headerSlug;

  const url = new URL(req.url);
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length >= 3 && (parts[0] === 't' || parts[0] === 'tenants')) {
    return `${parts[1]}/${parts[2]}`;
  }

  // subdomain form: `<owner>--<repo>.cms.example.com` (first label only).
  const host = url.hostname.split('.')[0];
  if (host.includes('--')) {
    const [owner, repo] = host.split('--');
    if (owner && repo) return `${owner}/${repo}`;
  }

  const cookies = parseCookies(req.headers.get('cookie'));
  const cookieSlug = cookies.koto_tenant;
  if (cookieSlug && /^[^/]+\/[^/]+$/.test(cookieSlug)) return cookieSlug;

  return null;
}
