#!/usr/bin/env node
// Sync .tenants.prod.toml to Cloudflare Worker secrets.
// Reads `[tenants."<owner>/<repo>"]` sections, builds TENANTS JSON, pipes to
// `wrangler secret put TENANTS`. Also syncs each `[vars]` key as its own secret.
//
// Usage:  pnpm run secrets:sync
// Pre-req: pnpm run build (so dist/koto_cms/wrangler.json exists)

import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse as parseToml } from 'smol-toml';

const PROD_CONFIG = fileURLToPath(new URL('../.tenants.prod.toml', import.meta.url));
const WRANGLER_JSON = 'dist/koto_cms/wrangler.json';

if (!existsSync(PROD_CONFIG)) {
  console.error(`[sync-tenants] missing ${PROD_CONFIG}`);
  console.error('  Create it (same shape as .tenants.config.toml) with real prod values.');
  process.exit(1);
}
if (!existsSync(WRANGLER_JSON)) {
  console.error(`[sync-tenants] missing ${WRANGLER_JSON}`);
  console.error('  Run `pnpm run build` first.');
  process.exit(1);
}

const parsed = parseToml(readFileSync(PROD_CONFIG, 'utf8'));
const tenants = parsed.tenants ?? {};
const vars = parsed.vars ?? {};

const targets = [];
if (Object.keys(tenants).length > 0) {
  targets.push(['TENANTS', JSON.stringify(tenants)]);
}
for (const [k, v] of Object.entries(vars)) {
  targets.push([k, String(v)]);
}

if (targets.length === 0) {
  console.error('[sync-tenants] no [tenants.*] or [vars] entries — nothing to sync');
  process.exit(1);
}

function putSecret(name, value) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'pnpm',
      ['exec', 'wrangler', 'secret', 'put', name, '-c', WRANGLER_JSON],
      { stdio: ['pipe', 'inherit', 'inherit'] },
    );
    child.stdin.write(value);
    child.stdin.end();
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`wrangler secret put ${name} exited ${code}`));
    });
    child.on('error', reject);
  });
}

console.log(`[sync-tenants] syncing ${targets.length} secret(s) via ${WRANGLER_JSON}:`);
for (const [k] of targets) console.log(`  - ${k}`);

for (const [k, v] of targets) {
  console.log(`[sync-tenants] → ${k}`);
  await putSecret(k, v);
}

console.log('[sync-tenants] done');
