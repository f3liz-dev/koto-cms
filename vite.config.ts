import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { cloudflare } from '@cloudflare/vite-plugin';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parse as parseToml } from 'smol-toml';

const TENANTS_CONFIG = fileURLToPath(new URL('./.tenants.config.toml', import.meta.url));
const DEV_VARS = fileURLToPath(new URL('./.dev.vars', import.meta.url));

function dotenvQuote(value: string): string {
  if (!value.includes("'")) return `'${value}'`;
  return `"${value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/"/g, '\\"')}"`;
}

function tenantsConfigPlugin(): Plugin {
  return {
    name: 'koto-tenants-config',
    apply: 'serve',
    config() {
      if (!existsSync(TENANTS_CONFIG)) {
        console.log(
          '[koto-tenants-config] .tenants.config.toml not found; falling back to wrangler.toml [vars]',
        );
        return;
      }
      const parsed = parseToml(readFileSync(TENANTS_CONFIG, 'utf8')) as {
        vars?: Record<string, unknown>;
        tenants?: Record<string, Record<string, unknown>>;
      };

      const lines: string[] = [
        '# AUTO-GENERATED from .tenants.config.toml by vite-plugin koto-tenants-config.',
        '# Edit .tenants.config.toml; this file is rewritten on every vite dev start.',
      ];

      if (parsed.tenants && Object.keys(parsed.tenants).length > 0) {
        lines.push(`TENANTS=${dotenvQuote(JSON.stringify(parsed.tenants))}`);
      }
      for (const [k, v] of Object.entries(parsed.vars ?? {})) {
        lines.push(`${k}=${dotenvQuote(String(v))}`);
      }

      writeFileSync(DEV_VARS, lines.join('\n') + '\n');
      const tenantCount = Object.keys(parsed.tenants ?? {}).length;
      const varCount = Object.keys(parsed.vars ?? {}).length;
      console.log(
        `[koto-tenants-config] wrote .dev.vars (${tenantCount} tenant${tenantCount === 1 ? '' : 's'}, ${varCount} extra var${varCount === 1 ? '' : 's'})`,
      );
    },
  };
}

export default defineConfig({
  root: 'web',
  publicDir: false,
  plugins: [
    tenantsConfigPlugin(),
    svelte({
      configFile: fileURLToPath(new URL('./svelte.config.js', import.meta.url)),
    }),
    cloudflare({
      configPath: fileURLToPath(new URL('./wrangler.toml', import.meta.url)),
    }),
  ],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@tiptap') || id.includes('tiptap-markdown') || id.includes('prosemirror')) {
              return 'tiptap';
            }
            if (id.includes('lowlight') || id.includes('highlight.js')) return 'highlight';
            if (id.includes('@markdoc')) return 'markdoc';
          }
        },
      },
    },
  },
  server: {
    port: 5173,
  },
});
