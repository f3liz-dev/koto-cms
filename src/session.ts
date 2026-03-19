/**
 * session.ts
 *
 * Stateless JWT sessions — OCI Functions compatible.
 * No in-memory store; all state lives in a signed HttpOnly cookie.
 *
 * Token format:  base64url(header).base64url(payload).base64url(HMAC-SHA256)
 * Secret:        From OCI Vault (production) or SESSION_SECRET env var (local dev)
 * TTL:           8 hours (configurable via SESSION_TTL_HOURS)
 *
 * Trade-off vs stateful sessions:
 *   + No shared store needed across OCI Function instances
 *   - Cannot forcibly invalidate individual tokens before expiry
 *     (rotate secret in Vault to invalidate all sessions at once)
 */

import { getSecrets } from "./server.ts";

export interface Session {
  id: string;
  fedi_handle: string;
  author_name: string;
  author_email: string;   // synthetic noreply by default
  custom_email?: string;  // user-provided email for co-author (optional)
  created_at: number;     // Unix ms
  exp: number;            // Unix ms — expiry
  version: number;        // Token version for revocation
}

// ── Constants ──────────────────────────────────────────────────────────────────

const COOKIE_NAME    = "cms_session";
const TTL_HOURS      = parseInt(Deno.env.get("SESSION_TTL_HOURS") ?? "8");
const SESSION_TTL_MS = TTL_HOURS * 60 * 60 * 1000;
const TOKEN_VERSION  = parseInt(Deno.env.get("SESSION_TOKEN_VERSION") ?? "1");

// ── Crypto helpers ─────────────────────────────────────────────────────────────

function b64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function fromB64url(s: string): Uint8Array {
  return Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
}

function encodeJson(obj: unknown): string {
  return b64url(new TextEncoder().encode(JSON.stringify(obj)).buffer as ArrayBuffer);
}

function decodeJson<T>(s: string): T {
  return JSON.parse(new TextDecoder().decode(fromB64url(s))) as T;
}

async function getKey(): Promise<CryptoKey> {
  const secret = getSecrets().sessionSecret;
  if (!secret) throw new Error("Session secret not available");
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

// ── JWT (HS256) ────────────────────────────────────────────────────────────────

const HEADER = encodeJson({ alg: "HS256", typ: "JWT" });

async function signToken(payload: Session): Promise<string> {
  const key      = await getKey();
  const unsigned = `${HEADER}.${encodeJson(payload)}`;
  const sig      = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${b64url(sig)}`;
}

async function verifyToken(token: string): Promise<Session | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, payloadB64, sigB64] = parts;
  const unsigned = `${header}.${payloadB64}`;

  const key   = await getKey();
  const valid = await crypto.subtle.verify(
    "HMAC", key,
    fromB64url(sigB64),
    new TextEncoder().encode(unsigned),
  );
  if (!valid) return null;

  const payload = decodeJson<Session>(payloadB64);
  if (Date.now() > payload.exp) return null;
  
  // Check token version for revocation
  if (payload.version !== TOKEN_VERSION) return null;

  return payload;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Create a signed JWT for the given session data.
 * Returns the raw token string — pass to sessionCookie() for the Set-Cookie value.
 */
export async function createSession(
  data: Omit<Session, "id" | "created_at" | "exp" | "version">,
): Promise<string> {
  const now = Date.now();
  return signToken({
    id: crypto.randomUUID(),
    created_at: now,
    exp: now + SESSION_TTL_MS,
    version: TOKEN_VERSION,
    ...data
  });
}

/**
 * Extract and verify the session from the request cookie.
 * Returns null if missing, tampered, or expired.
 */
export async function getSession(req: Request): Promise<Session | null> {
  const raw = (req.headers.get("cookie") ?? "")
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(COOKIE_NAME + "="))
    ?.slice(COOKIE_NAME.length + 1);

  return raw ? verifyToken(raw) : null;
}

/**
 * Patch mutable fields and return a fresh signed token.
 * Caller must update Set-Cookie in the response.
 */
export async function updateSession(
  session: Session,
  patch: Partial<Pick<Session, "custom_email">>,
): Promise<string> {
  return signToken({ ...session, ...patch });
}

/**
 * No-op — stateless JWT logout is handled by clearing the cookie.
 * Kept for call-site compatibility.
 */
export function deleteSession(_id: string): void { /* nothing to do */ }

/**
 * Build the Set-Cookie header value.
 * Pass clear=true to expire the cookie immediately (logout).
 */
export function sessionCookie(token: string, clear = false): string {
  if (clear) return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;
}
