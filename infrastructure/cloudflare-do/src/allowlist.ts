import type { TenantConfig } from './types';

function normalize(handle: string): string {
  return handle.replace(/^@/, '').toLowerCase();
}

export function allowlist(tenant: TenantConfig): Set<string> {
  return new Set(
    (tenant.documentEditors ?? '')
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean)
      .map(normalize),
  );
}

export function isAllowed(tenant: TenantConfig, handle: string): boolean {
  return allowlist(tenant).has(normalize(handle));
}
