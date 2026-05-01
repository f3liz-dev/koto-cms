# koto-cms Cloudflare Durable Objects backend

Port of the Elixir/Phoenix backend to a Cloudflare Workers + Durable Objects
stack. One DO instance per GitHub repository (tenant).

## Layout

```
src/
├── worker.ts         entry; routes /api,/auth,/miauth,/health to DO, everything else to Workers Assets
├── do.ts             KotoCmsDO class – all HTTP handlers
├── config.ts         tenant resolution from env.TENANTS
├── session.ts        HS256 JWT create/verify (jose)
├── allowlist.ts
├── github.ts         GitHub API client (contents, trees, branches, PRs, labels)
├── miauth.ts         Fediverse miauth OAuth client
├── rate-limit.ts     DO-storage-backed per-IP counter
├── cookies.ts
├── cors.ts           SecureHeaders equivalent
├── glob.ts           port of lib/koto_cms/github.ex glob_match/2
└── types.ts
```

## Tenant config

`env.TENANTS` is a JSON object keyed by `"owner/repo"`:

```json
{
  "alice/my-docs": {
    "githubToken": "ghp_…",
    "sessionSecret": "…64-char random…",
    "documentEditors": "@alice@example.social, @bob@example.social",
    "defaultBranch": "main",
    "sessionTtlHours": 8,
    "sessionTokenVersion": 1,
    "miauthCallbackUrl": "https://alice--my-docs.cms.example.com/miauth/callback",
    "appName": "Koto"
  }
}
```

In production, store this with `wrangler secret put TENANTS` (not the `[vars]`
block in `wrangler.toml`).

## Tenant routing

A request is routed to a DO instance based on the tenant slug, resolved in this
order:

1. `X-Koto-Repo: owner/repo` header (preferred for internal calls)
2. Path prefix `/t/<owner>/<repo>/…` or `/tenants/<owner>/<repo>/…`
3. Subdomain form `<owner>--<repo>.cms.example.com`

## Dev

```
pnpm install
pnpm run dev             # wrangler dev
```

Then build the Svelte frontend first so Workers Assets can serve it:

```
# from repo root
pnpm run build
# then from this directory
pnpm run dev
```

## Deploy

```
pnpm run deploy
```
