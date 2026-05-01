# Koto

A lightweight, stateless CMS that bridges **Fediverse (MiAuth) authentication**
with **GitHub-based content storage**, now running entirely on the **Cloudflare
edge**: Workers + Durable Objects for the API, Workers Assets for the Svelte
frontend.

Editors log in with their Fediverse handle. All GitHub commits are made by a
single bot account, with the editor's identity preserved in git commit trailers.

## Stack

- **Frontend**: Svelte 5 (runes) + TypeScript 7 (tsgo) + Tiptap v3 WYSIWYG
  with Markdown/Markdoc round-trip
- **Backend**: Cloudflare Worker + Durable Objects. One DO instance per GitHub
  repository (tenant)
- **Auth**: Fediverse MiAuth → HS256 JWT cookie, per-tenant signing secret
- **Storage**: GitHub is the only source of truth. DO storage holds only
  rate-limit counters

## Repo layout

```
web/                           Svelte frontend source
infrastructure/cloudflare-do/
  src/
    worker.ts                  edge entry
    do.ts                      KotoCmsDO class (all API handlers)
    github.ts, miauth.ts, session.ts, …
  tsconfig.json                Worker-side tsconfig (separate lib/types)
scripts/convert-markdoc.mjs    markdoc → VitePress CLI
docs/editing-heuristics.md     editor UX research + gap tracking
wrangler.toml                  Worker config (at root)
vite.config.ts                 uses @cloudflare/vite-plugin → single dev server
svelte.config.js, tsconfig.json
package.json                   single package for frontend + worker
dist/                          build output (client + worker bundle)
```

## Dev

```bash
pnpm install
pnpm run dev        # vite + workerd in one server at http://localhost:5173
pnpm run check      # svelte-check
pnpm run typecheck  # tsgo (frontend tsconfig + worker tsconfig)
pnpm run build      # → dist/client + dist/koto_cms (worker bundle + generated wrangler.json)
pnpm run deploy     # wrangler deploy (reads from dist after build)
```

`pnpm run dev` starts Vite and runs the Worker in `workerd` inside the same
process via `@cloudflare/vite-plugin`. Routes under `/api`, `/auth`, `/miauth`,
`/health` hit the Durable Object; everything else is served by Vite/Workers
Assets. No proxy, no port mismatch, HMR on both sides.

## Tenant config

`infrastructure/cloudflare-do/wrangler.toml` declares a `TENANTS` env var —
a JSON map keyed by `"owner/repo"`:

```json
{
  "alice/my-docs": {
    "githubToken": "ghp_…",
    "sessionSecret": "…64+ random chars…",
    "documentEditors": "@alice@example.social, @bob@example.social",
    "defaultBranch": "main",
    "sessionTtlHours": 8,
    "sessionTokenVersion": 1,
    "miauthCallbackUrl": "https://alice--my-docs.cms.example.com/miauth/callback",
    "appName": "Koto"
  }
}
```

For production: `wrangler secret put TENANTS`.

## Tenant routing

A request is routed to the correct DO instance via (in order):

1. `X-Koto-Repo: owner/repo` header
2. Path prefix `/t/<owner>/<repo>/…` or `/tenants/<owner>/<repo>/…`
3. Subdomain form `<owner>--<repo>.cms.example.com`

The first matching rule wins and the Worker calls
`env.KOTO_DO.idFromName("owner/repo")` to address the tenant's DO.

## Markdoc → VitePress conversion

Content is edited as [Markdoc](https://markdoc.dev/) (standard markdown plus
`{% tag %}` blocks). The VitePress build that renders the final site runs in
the *target* content repository, not here. Use the converter shipped in
`web/lib/markdocToVitepress.ts` in that repo's build pipeline.

### Mapping

| Markdoc | VitePress markdown |
|---|---|
| `{% callout type="info" %}…{% /callout %}` | `:::info … :::` |
| `{% tip %} / {% warning %} / {% danger %} / {% details title="x" %}` | `:::tip` / `:::warning` / `:::danger` / `:::details x` |
| `{% YouTube id="abc" /%}` | `<YouTube id="abc" />` |
| `{% MyBlock attr=val %}…{% /MyBlock %}` | `<MyBlock attr="val">…</MyBlock>` |
| frontmatter, code fences, prose | pass-through |

### CLI example

```bash
# single file
node --experimental-strip-types scripts/convert-markdoc.mjs src/foo.md dist/foo.md

# via stdin
cat src/foo.md | node --experimental-strip-types scripts/convert-markdoc.mjs > dist/foo.md
```

For a VitePress target repo, typical integration is either:

1. Copy `web/lib/markdocToVitepress.ts` into the target repo and call it from
   a small preprocess script that walks `docs/**/*.md` before `vitepress build`.
2. Or, via `"pnpm markdoc:convert"` that shells out to
   `scripts/convert-markdoc.mjs` for each file (simplest).

The converter is a pure string function with no runtime dependencies, so it
vendors cleanly.

## Deploy

```bash
pnpm run build                              # frontend → public/
cd infrastructure/cloudflare-do
pnpm run deploy                             # wrangler deploy
```

## HTTP API

All endpoints require the tenant slug to resolve (see routing above) and most
require a `cms_session` cookie (issued by `/miauth/callback`).

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | no | liveness |
| GET | `/api/diagnostics` | no | config sanity |
| GET | `/auth/login?handle=@x@y` | no | initiate MiAuth |
| GET | `/miauth/callback?session=…` | no | complete MiAuth, set cookie |
| POST | `/auth/logout` | no | clear cookie |
| GET | `/api/me` | yes | current session |
| PATCH | `/api/me` | yes | update custom email |
| GET | `/api/repo` | yes | repo slug |
| GET | `/api/config?ref=` | yes | `.koto.json` |
| GET | `/api/tree?ref=` | yes | filtered file tree |
| GET | `/api/files?path=&ref=` | yes | directory listing |
| GET | `/api/file?path=&ref=` | yes | file content |
| PUT | `/api/file` | yes | create/update file + ensure draft PR |
| DELETE | `/api/file?path=&sha=&branch=` | yes | delete file + ensure draft PR |
| GET | `/api/prs` | yes | user's open PRs |
| POST | `/api/pr-new` | yes | create working branch |
| POST | `/api/pr-ready` | yes | mark draft PR ready |
| GET | `/api/pr-preview?prNumber=` | yes | extract preview URL from PR comments |
