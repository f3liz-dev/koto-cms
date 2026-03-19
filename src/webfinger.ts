/**
 * webfinger.ts
 *
 * Fediverse handle parsing and WebFinger lookup utilities.
 */

export interface HandleParts {
  username: string;
  instance: string;
}

/**
 * Validate and parse a Fediverse handle.
 * Accepts: @user@instance.com  or  user@instance.com
 */
export function validateHandle(handle: string): HandleParts | null {
  const normalized = handle.startsWith("@") ? handle.slice(1) : handle;
  const parts = normalized.split("@");
  if (parts.length !== 2) return null;

  const [username, instance] = parts;
  if (!username || !instance) return null;
  if (!instance.includes(".") && instance !== "localhost") return null;

  return { username, instance };
}

/**
 * Normalize a Fediverse handle for comparison (lowercase, no leading @).
 */
export function normalizeHandle(handle: string): string {
  const normalized = handle.startsWith("@") ? handle.slice(1) : handle;
  return normalized.toLowerCase();
}

/**
 * Parse a WebFinger JSON response and return the profile or self URL.
 */
export function parseWebFinger(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;

  const wf = data as Record<string, unknown>;
  const links = wf.links as Array<{ rel?: string; href?: string }>;
  if (!Array.isArray(links)) return null;

  const profile = links.find((l) => l.rel === "http://webfinger.net/rel/profile-page");
  if (profile?.href) return profile.href;

  const self = links.find((l) => l.rel === "self");
  return self?.href ?? null;
}
