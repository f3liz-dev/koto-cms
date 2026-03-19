/**
 * server.ts — CMS HTTP handler (Deno / OCI Functions)
 */

import { initSecrets, type Secrets } from "./secrets.ts";
import { validateHandle } from "./webfinger.ts";
import { validateAllowlist } from "./allowlist.ts";
import { initiateMiAuthFlow, handleMiAuthCallback as performMiAuthCallback } from "./miauth.ts";
import {
  createSession, getSession, deleteSession, updateSession, sessionCookie,
} from "./session.ts";
import {
  listFiles, getFile, commitFile, deleteFileOnBranch,
  createWorkingBranch, ensureDraftPr, listUserPrs, markPrReady, commitMessage,
} from "./github.ts";

// ── Secrets ────────────────────────────────────────────────────────────────────

// Global secrets cache - initialized at cold start
let secrets: Secrets | null = null;

/**
 * Get secret values - either from Vault cache or environment variables
 */
function getSecrets(): Secrets {
  if (secrets) return secrets;
  
  // Fallback to env vars for local development
  return {
    githubBotToken: Deno.env.get("GITHUB_BOT_TOKEN")!,
    sessionSecret: Deno.env.get("SESSION_SECRET")!,
    githubAccessToken: Deno.env.get("GITHUB_ACCESS_TOKEN") ?? Deno.env.get("GITHUB_BOT_TOKEN")!,
  };
}

// Export for use in other modules
export { getSecrets };

// ── Logger ─────────────────────────────────────────────────────────────────────

type Level = "info" | "warn" | "error";
function log(level: Level, msg: string, meta?: Record<string, unknown>) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta });
  level === "error" ? console.error(line) : console.log(line);
}

// ── Rate limiter ───────────────────────────────────────────────────────────────

function makeRateLimiter(max: number, windowMs: number) {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return (ip: string) => {
    const now = Date.now();
    let b = buckets.get(ip);
    if (!b || now > b.resetAt) { b = { count: 0, resetAt: now + windowMs }; buckets.set(ip, b); }
    b.count++;
    return { allowed: b.count <= max, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  };
}

const checkRate     = makeRateLimiter(60, 60_000);   
const checkAuthRate = makeRateLimiter(10, 60_000);   

// ── Helpers ────────────────────────────────────────────────────────────────────

function getIp(req: Request): string {
  return req.headers.get("cf-connecting-ip")
    ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim()
    ?? "unknown";
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-XSS-Protection": "1; mode=block",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
      ...extra
    },
  });
}

function validateEnv(): string[] {
  // Check for Vault OCIDs (production) or plain env vars (local dev)
  const vaultMode = !!Deno.env.get("GITHUB_BOT_TOKEN_SECRET_OCID");
  
  if (vaultMode) {
    return [
      "GITHUB_BOT_TOKEN_SECRET_OCID",
      "SESSION_SECRET_OCID",
      "GITHUB_ACCESS_TOKEN_SECRET_OCID",
      "GITHUB_REPO"
    ].filter(k => !Deno.env.get(k));
  } else {
    return [
      "GITHUB_BOT_TOKEN",
      "GITHUB_REPO",
      "SESSION_SECRET"
    ].filter(k => !Deno.env.get(k));
  }
}

// ── Frontend URL (Object Storage / CDN) ───────────────────────────────────────

const FRONTEND_URL = Deno.env.get("FRONTEND_URL") ?? "";

// ── Core request handler ───────────────────────────────────────────────────────

export async function handleRequest(req: Request): Promise<Response> {
  const url    = new URL(req.url);
  const path   = url.pathname;
  const method = req.method;
  const ip     = getIp(req);

  if (method === "OPTIONS") return new Response(null, { status: 204 });

  // ── Health ──────────────────────────────────────────────────────────────────
  if (path === "/health" && method === "GET") {
    return json({ ok: true, ts: new Date().toISOString() });
  }

  // ── Rate limiting ────────────────────────────────────────────────────────────
  const rl = (path.startsWith("/auth") || path.startsWith("/miauth"))
    ? checkAuthRate(ip)
    : checkRate(ip);
  if (!rl.allowed) return json({ error: "Too many requests" }, 429, { "Retry-After": String(rl.retryAfter) });

  // ── GET /auth/login?handle=… ─────────────────────────────────────────────────
  if (path === "/auth/login" && method === "GET") {
    const handle = url.searchParams.get("handle");
    if (!handle || !validateHandle(handle)) return json({ error: "Invalid handle" }, 400);

    if (!(await validateAllowlist(handle))) {
      log("warn", "Login rejected — not in allowlist", { ip, handle });
      return json({ error: `${handle} is not permitted` }, 403);
    }

    try {
      const parts = handle.split("@");
      const domain = parts[parts.length - 1]; // Always gets the last element
      const instanceUrl = `https://${domain}`;
      const result = await initiateMiAuthFlow({ handle });

      // Pin the instance to a temporary cookie to prevent SSRF in callback
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 
          "Content-Type": "application/json",
          "Set-Cookie": `miauth_origin=${instanceUrl}; HttpOnly; Secure; Max-Age=300; SameSite=Lax; Path=/`
        },
      });
    } catch (err) {
      log("error", "initiateMiAuthFlow failed", { ip, handle, err: String(err) });
      return json({ error: "Authentication service unavailable" }, 500);
    }
  }

  // ── GET /miauth/callback (MiAuth Browser Redirect) ───────────────────────────
  if (path === "/miauth/callback" && method === "GET") {
    const sessionId = url.searchParams.get("session");
    const cookies = req.headers.get("Cookie") || "";
    const originMatch = cookies.match(/miauth_origin=(https:\/\/[^;]+)/);
    const pinnedInstance = originMatch ? originMatch[1] : null;

    if (!sessionId || !pinnedInstance) {
      log("warn", "Callback rejected: missing session or origin cookie", { ip });
      return json({ error: "Auth session expired or invalid origin" }, 400);
    }

    try {
      const miSession = await performMiAuthCallback(sessionId, pinnedInstance);
      if (!miSession.ok) return json({ error: miSession.error }, 401);

      const token = await createSession({
        fedi_handle:  miSession.fedi_handle!,
        author_name:  miSession.author_name!,
        author_email: miSession.author_email!,
      });

      // Use two Set-Cookie headers (not a comma-joined value).
      // Put cms_session last so deployments/proxies that incorrectly keep only
      // one Set-Cookie header still preserve login state.
      const headers = new Headers({ "Location": "/" });
      headers.append("Set-Cookie", "miauth_origin=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0");
      headers.append("Set-Cookie", sessionCookie(token));
      return new Response(null, {
        status: 302,
        headers,
      });
    } catch (err) {
      log("error", "MiAuth callback crash", { ip, err: String(err) });
      return json({ error: "Authentication failed" }, 500);
    }
  }

  // ── POST /auth/logout ────────────────────────────────────────────────────────
  if (path === "/auth/logout" && method === "POST") {
    const session = await getSession(req);
    if (session) deleteSession(session.id);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Set-Cookie": sessionCookie("", true) },
    });
  }

  // ── Protected /api/* routes ──────────────────────────────────────────────────
  if (path.startsWith("/api/")) {
    const session = await getSession(req);
    if (!session) return json({ error: "Unauthorized" }, 401);

    if (path === "/api/me" && method === "GET") {
      return json({
        fedi_handle:  session.fedi_handle,
        author_name:  session.author_name,
        author_email: session.author_email,
        custom_email: session.custom_email ?? null,
      });
    }

    if (path === "/api/repo" && method === "GET") {
      const repo = Deno.env.get("GITHUB_REPO") ?? "unknown/unknown";
      return json({ repo });
    }

    if (path === "/api/me" && method === "PATCH") {
      const { custom_email } = await req.json();
      if (custom_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(custom_email)) {
        return json({ error: "Invalid email format" }, 400);
      }
      const newToken = await updateSession(session, { custom_email: custom_email?.trim() || undefined });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Set-Cookie": sessionCookie(newToken) },
      });
    }

    if (path === "/api/files" && method === "GET") {
      return json(await listFiles(url.searchParams.get("path") ?? "", url.searchParams.get("ref") ?? undefined));
    }

    if (path === "/api/file" && method === "GET") {
      const filePath = url.searchParams.get("path");
      if (!filePath) return json({ error: "Missing path" }, 400);
      return json(await getFile(filePath, url.searchParams.get("ref") ?? undefined));
    }

    if (path === "/api/prs" && method === "GET") {
      return json(await listUserPrs(session.fedi_handle));
    }

    if (path === "/api/pr-new" && method === "POST") {
      const branchName = await createWorkingBranch(session.fedi_handle);
      return json({ branchName, prUrl: null, prNumber: null, prState: "draft" });
    }

    if (path === "/api/file" && method === "PUT") {
      const { path: filePath, content, sha, branchName } = await req.json();
      const message = commitMessage(sha ? "update" : "create", filePath, {
        name: session.author_name,
        email: session.custom_email || session.author_email,
        handle: session.fedi_handle,
      });
      await commitFile(filePath, content, sha, message, branchName);
      const pr = await ensureDraftPr(branchName, session.fedi_handle);
      return json({ branchName, prUrl: pr.prUrl, prNumber: pr.prNumber });
    }

    if (path === "/api/file" && method === "DELETE") {
      const filePath = url.searchParams.get("path");
      const sha = url.searchParams.get("sha");
      const branchName = url.searchParams.get("branch");
      const message = commitMessage("delete", filePath!, {
        name: session.author_name,
        email: session.custom_email || session.author_email,
        handle: session.fedi_handle,
      });
      await deleteFileOnBranch(filePath!, sha!, message, branchName!);
      const pr = await ensureDraftPr(branchName!, session.fedi_handle);
      return json({ branchName, prUrl: pr.prUrl, prNumber: pr.prNumber });
    }

    if (path === "/api/pr-ready" && method === "POST") {
      const { prNumber, title, body: prBodyText } = await req.json();
      return json(await markPrReady(prNumber, title, prBodyText ?? ""));
    }

    return json({ error: "Not found" }, 404);
  }

  // ── Frontend redirect (Object Storage / CDN) ──────────────────────────────────
  if (method === "GET" && FRONTEND_URL) {
    const safePath = path.replace(/\.\./g, "");
    const targetUrl = safePath === "/" || safePath === "" 
      ? `${FRONTEND_URL}/index.html`
      : `${FRONTEND_URL}${safePath}`;
    
    return new Response(null, {
      status: 302,
      headers: { "Location": targetUrl },
    });
  }

  return json({ error: "Not found" }, 404);
}

// ── Standalone Entry Point ─────────────────────────────────────────────────────

if (import.meta.main) {
  const missing = validateEnv();
  if (missing.length) { log("error", "Missing required env vars", { missing }); Deno.exit(1); }

  // Initialize secrets from Vault (if in OCI Functions) or use env vars (local dev)
  const vaultMode = !!Deno.env.get("GITHUB_BOT_TOKEN_SECRET_OCID");
  if (vaultMode) {
    log("info", "Initializing secrets from OCI Vault...");
    try {
      secrets = await initSecrets();
      log("info", "Secrets loaded successfully from Vault");
    } catch (err) {
      log("error", "Failed to load secrets from Vault", { err: String(err) });
      Deno.exit(1);
    }
  } else {
    log("info", "Using environment variables (local dev mode)");
    secrets = {
      githubBotToken: Deno.env.get("GITHUB_BOT_TOKEN")!,
      sessionSecret: Deno.env.get("SESSION_SECRET")!,
      githubAccessToken: Deno.env.get("GITHUB_ACCESS_TOKEN") ?? Deno.env.get("GITHUB_BOT_TOKEN")!,
    };
  }

  Deno.serve({
    port: parseInt(Deno.env.get("CMS_PORT") ?? "8080"),
    hostname: Deno.env.get("CMS_HOST") ?? "0.0.0.0",
    handler: handleRequest,
    onListen: ({ hostname, port }) => log("info", "CMS server ready", { hostname, port }),
  });
}
