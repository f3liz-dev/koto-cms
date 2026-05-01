const GENERAL_LIMIT = 60;
const AUTH_LIMIT = 10;
const WINDOW_MS = 60_000;

interface RateBucket {
  count: number;
  resetAt: number;
}

export async function checkRateLimit(
  storage: DurableObjectStorage,
  ip: string,
  path: string,
): Promise<{ ok: boolean; retryAfter?: number }> {
  const limit = path.startsWith('/auth') || path.startsWith('/miauth') ? AUTH_LIMIT : GENERAL_LIMIT;
  const key = `rl:${ip}`;
  const now = Date.now();

  const current = (await storage.get<RateBucket>(key)) ?? null;
  if (current && now < current.resetAt) {
    if (current.count >= limit) {
      return { ok: false, retryAfter: Math.ceil((current.resetAt - now) / 1000) };
    }
    await storage.put(key, { count: current.count + 1, resetAt: current.resetAt });
    return { ok: true };
  }
  await storage.put(key, { count: 1, resetAt: now + WINDOW_MS });
  return { ok: true };
}

export function getClientIp(req: Request): string {
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf;
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return 'unknown';
}
