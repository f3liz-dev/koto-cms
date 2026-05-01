import { SignJWT, jwtVerify } from 'jose';
import type { GatewayClaims } from './types';
import { buildCookie } from './cookies';

const ALG = 'HS256';
const SESSION_COOKIE = 'koto_session';
const TENANT_COOKIE = 'koto_tenant';
const DEFAULT_TTL_HOURS = 24;

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

function ttlSeconds(ttlHours?: string | number): number {
  const raw = typeof ttlHours === 'string' ? Number(ttlHours) : ttlHours;
  const hours = Number.isFinite(raw) && raw && raw > 0 ? raw : DEFAULT_TTL_HOURS;
  return Math.floor(hours * 3600);
}

export async function createGatewaySession(
  secret: string,
  ttlHours: string | number | undefined,
  data: {
    fedi_handle: string;
    author_name: string;
    author_email: string;
    custom_email?: string;
  },
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ttlSeconds(ttlHours);
  const claims: GatewayClaims = {
    fedi_handle: data.fedi_handle,
    author_name: data.author_name,
    author_email: data.author_email,
    custom_email: data.custom_email,
    created_at: now,
    exp,
  };
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: ALG, typ: 'JWT' })
    .setExpirationTime(exp)
    .sign(key(secret));
}

export async function verifyGatewaySession(
  secret: string,
  token: string,
): Promise<GatewayClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: [ALG] });
    return payload as unknown as GatewayClaims;
  } catch {
    return null;
  }
}

export function gatewaySessionCookie(
  token: string,
  ttlHours: string | number | undefined,
  clear = false,
): string {
  if (clear) {
    return buildCookie(SESSION_COOKIE, '', { maxAge: 0, secure: true });
  }
  return buildCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    maxAge: ttlSeconds(ttlHours),
  });
}

export function tenantSelectionCookie(slug: string, clear = false): string {
  if (clear) {
    return buildCookie(TENANT_COOKIE, '', { maxAge: 0, secure: true });
  }
  return buildCookie(TENANT_COOKIE, encodeURIComponent(slug), {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    maxAge: ttlSeconds(undefined),
  });
}

export const cookies = { SESSION: SESSION_COOKIE, TENANT: TENANT_COOKIE };
