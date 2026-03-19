/**
 * allowlist.ts
 *
 * Permitted editor allowlist.
 * Sources (both are merged if provided):
 *   DOCUMENT_EDITORS      — comma-separated handles in env var
 *   DOCUMENT_EDITORS_FILE — path to a file with one handle per line
 *
 * OCI Functions note:
 *   Cache is per-invocation only (no shared memory between calls).
 *   For large lists, prefer DOCUMENT_EDITORS env var over file.
 */

import { normalizeHandle } from "./webfinger.ts";

let cachedAllowlist: Set<string> | null = null;

async function loadAllowlist(): Promise<Set<string>> {
  if (cachedAllowlist) return cachedAllowlist;

  const allowlist = new Set<string>();

  const envList = Deno.env.get("DOCUMENT_EDITORS");
  if (envList) {
    for (const handle of envList.split(",")) {
      const n = normalizeHandle(handle.trim());
      if (n) allowlist.add(n);
    }
  }

  const filePath = Deno.env.get("DOCUMENT_EDITORS_FILE");
  if (filePath) {
    try {
      const content = await Deno.readTextFile(filePath);
      for (const line of content.split("\n")) {
        const n = normalizeHandle(line.trim());
        if (n) allowlist.add(n);
      }
    } catch (err) {
      console.error(`Failed to load allowlist from ${filePath}:`, err);
    }
  }

  cachedAllowlist = allowlist;
  return allowlist;
}

export async function validateAllowlist(handle: string): Promise<boolean> {
  const allowlist = await loadAllowlist();
  return allowlist.has(normalizeHandle(handle));
}

export function resetAllowlistCache(): void {
  cachedAllowlist = null;
}

export async function getAllowlist(): Promise<string[]> {
  return Array.from(await loadAllowlist()).sort();
}
