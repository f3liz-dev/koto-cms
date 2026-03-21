# Koto

A lightweight, stateless CMS backend that bridges **Fediverse (MiAuth)
authentication** with **GitHub-based content storage**, built with **Elixir/Phoenix**.

Editors log in with their Misskey handle. All GitHub commits are made by a
single bot account, with the editor's identity preserved in git commit trailers.

> **Note**: This project has been migrated from TypeScript/Deno to Elixir/Phoenix. See `MIGRATION_GUIDE.md` for details.

## Quick Start

```bash
# Install Elixir dependencies
mix deps.get

# Configure environment
cp .env.example .env
# Generate secrets: mix phx.gen.secret
# Edit .env with your values

# Start the server
mix phx.server
```

Server runs at http://localhost:3000

For Docker:
```bash
docker compose up
```

See `README_ELIXIR.md` for detailed setup instructions.

---

## Architecture

```
Browser
    │
    ├─── Static Assets ──────────► OCI Object Storage
    │
    └─── API Requests ───────────► Container Instance (ARM64)
                                        │
                                        └──► GitHub API
```

**Authentication Flow:**

1. User enters Fediverse handle → Server validates against allowlist
2. Server generates MiAuth session URL → Redirect to Misskey instance
3. User authorizes on Misskey → Callback to server
4. Server verifies session → Issues signed JWT cookie

**Key Properties:**

- GitHub bot token never leaves the server
- Stateless JWT sessions (no database/Redis)
- All content stored in GitHub
- Container-native deployment

---

## File Structure

```
koto-cms/
├── Dockerfile                  # x86_64 Docker build
├── Dockerfile.arm64            # ARM64 optimized build
├── docker-compose.yml          # Local development
├── .env.example.elixir         # Environment variable template
├── mix.exs                     # Elixir project definition
│
├── web/                        # Frontend source (Vite + Preact + Milkdown)
│   ├── index.html
│   ├── App.jsx
│   ├── api.js
│   ├── MarkdownEditor.jsx
│   └── styles/app.css
│
├── lib/
│   ├── koto_cms/               # Business logic
│   │   ├── github.ex           # GitHub REST API operations
│   │   ├── miauth.ex           # MiAuth flow (initiate + callback)
│   │   ├── session.ex          # Stateless JWT session
│   │   └── allowlist.ex        # Editor allowlist validation
│   └── koto_cms_web/           # Web layer
│       ├── controllers/        # HTTP handlers
│       ├── plugs/              # Middleware
│       ├── router.ex           # Route definitions
│       └── endpoint.ex         # HTTP endpoint
│
└── config/                     # Configuration files
    ├── config.exs
    ├── dev.exs
    ├── test.exs
    ├── prod.exs
    └── runtime.exs
```

---

## Environment Variables

| Variable                | Required | Default                                 | Description                               |
| ----------------------- | -------- | --------------------------------------- | ----------------------------------------- |
| `GITHUB_BOT_TOKEN`      | ✅       | —                                       | GitHub PAT with repo read/write           |
| `GITHUB_REPO`           | ✅       | —                                       | `owner/repo`                              |
| `SESSION_SECRET`        | ✅       | —                                       | HMAC signing secret (generate with `mix phx.gen.secret`) |
| `SECRET_KEY_BASE`       | ✅       | —                                       | Phoenix secret (generate with `mix phx.gen.secret`) |
| `SESSION_SIGNING_SALT`  | ✅       | —                                       | Session signing salt (generate with `mix phx.gen.secret`) |
| `DOCUMENT_EDITORS`      | ✅*      | —                                       | Comma-separated `@user@instance` handles  |
| `MIAUTH_CALLBACK_URL`   | ✅       | `http://localhost:3000/miauth/callback` | Publicly reachable callback URL           |
| `GITHUB_BRANCH`         | —        | `main`                                  | Base branch                               |
| `SESSION_TTL_HOURS`     | —        | `8`                                     | Session lifetime                          |
| `SESSION_TOKEN_VERSION` | —        | `1`                                     | Token version for revocation              |
| `SESSION_COOKIE_KEY`    | —        | `_koto_cms_key`                         | Session cookie name                       |
| `APP_NAME`              | —        | `Koto`                                  | Name shown in MiAuth authorization screen |
| `DOCUMENT_EDITORS_FILE` | —        | —                                       | Path to file with one handle per line     |
| `FRONTEND_URL`          | ✅*      | —                                       | Object Storage URL for frontend assets    |
| `PORT`                  | —        | `3000`                                  | Server port                               |
| `PHX_HOST`              | —        | `localhost`                             | Phoenix host                              |
| `LIVEVIEW_SIGNING_SALT` | —        | `dev_liveview_salt`                     | LiveView signing salt (dev only)          |

*`DOCUMENT_EDITORS` or `DOCUMENT_EDITORS_FILE` must be set; otherwise all logins
are rejected.

*`FRONTEND_URL` is required for production deployments. For local development, use Vite dev server instead (`npm run dev`).

---

## Deployment

### OCI Container Instances (ARM A1)

Simple, always-on deployment using ARM64 free tier.

**Features:**
- No cold starts (always-on container)
- ARM A1 free tier (4 OCPUs + 24GB RAM)
- Direct public IP access
- OCI Vault for secrets
- Cost: ~$0.03/month

**Quick Deploy:**

```bash
cd infrastructure
terraform init
terraform apply
```

See [infrastructure/MANUAL_DEPLOY.md](infrastructure/MANUAL_DEPLOY.md) for complete step-by-step instructions.

> ⚠️ `SESSION_SECRET` and `SECRET_KEY_BASE` must be identical across all instances. Store them in OCI Vault. To invalidate all sessions, rotate the secrets.

### Local Development

**Backend:**
```bash
cp .env.example.elixir .env
mix deps.get
mix phx.server
```

**Frontend:**
```bash
npm install
npm run dev
```

Frontend runs at http://localhost:5173, backend at http://localhost:3000.

**Docker Compose:**
```bash
cp .env.example.elixir .env
docker compose up
npm run dev  # Frontend in separate terminal
```

---

## Login Flow

**Step 1 — Editor enters handle**

```
GET /auth/login?handle=@alice@misskey.io
→ { sessionUrl: "https://misskey.io/miauth/abc123...", sessionId: "abc123..." }
```

**Step 2 — Editor authorizes in Misskey**

The browser opens the `sessionUrl`. The user taps "Authorize" in Misskey.

**Step 3 — Callback**

```
GET /miauth/callback?session=abc123...
→ 302 Redirect /  +  Set-Cookie: cms_session=<JWT>
```

From this point, the JWT cookie is sent automatically on every API request.

---

## Commit Attribution

Every commit is authored by the bot but carries editor identity as git trailers:

```
content: update docs/getting-started.md

Co-authored-by: Alice <alice+misskey.io@users.noreply.fediverse>
Fediverse: `@alice@misskey.io`
```

Editors can also set a custom email via
`PATCH /api/me { "custom_email": "real@example.com" }`.

---

## API Reference

### Public

| Method | Path                   | Description                     |
| ------ | ---------------------- | ------------------------------- |
| `GET`  | `/health`              | Liveness probe                  |
| `GET`  | `/auth/login?handle=…` | Initiate MiAuth                 |
| `GET`  | `/miauth/callback`     | Complete MiAuth redirect, set JWT cookie |
| `POST` | `/auth/logout`         | Clear session cookie            |

### Protected (requires session cookie)

| Method   | Path                              | Description                              |
| -------- | --------------------------------- | ---------------------------------------- |
| `GET`    | `/api/me`                         | Current user info                        |
| `PATCH`  | `/api/me`                         | Update `custom_email`                    |
| `GET`    | `/api/files?path=…&ref=…`         | List directory                           |
| `GET`    | `/api/file?path=…&ref=…`          | Get file content + sha                   |
| `PUT`    | `/api/file`                       | Create / update file (commits to branch) |
| `DELETE` | `/api/file?path=…&sha=…&branch=…` | Delete file                              |
| `GET`    | `/api/prs`                        | List open CMS PRs for current user       |
| `POST`   | `/api/pr-new`                     | Create a fresh working branch            |
| `POST`   | `/api/pr-ready`                   | Convert draft PR → ready for review      |

---

## Running Tests

```bash
mix test
```

For coverage:
```bash
mix test --cover
```

---

## Security Notes

- Bot PAT is **server-side only** — never sent to the browser
- JWT sessions use **HMAC-SHA256** (HS256); cookie is `HttpOnly; SameSite=Lax`
- Allowlist is checked **before** any Misskey API calls
- Rate limiting: 60 req/min general, 10 req/min for auth endpoints
- `SESSION_SECRET` rotation immediately invalidates all active sessions
- Security headers: X-Frame-Options, CSP, X-Content-Type-Options
- DOMPurify sanitization for preview rendering
- Sandboxed iframes for untrusted content
- Token versioning for session revocation

**See [SECURITY.md](SECURITY.md) for complete security documentation.**

### Session Revocation

To invalidate all active sessions without rotating the secret:

```bash
# Increment token version
export SESSION_TOKEN_VERSION=2

# Restart the application
# All tokens with version=1 will be rejected
```

### Secrets Management

**Production:** Use OCI Vault for secrets (configured in `infrastructure/stack.tf`)

---

---

## Limitations

- MiAuth works with **Misskey-compatible instances only** (Misskey, Calckey, Sharkey, etc.)
- Rate limiter is **in-memory per instance** (ETS-based) — resets on restart
- Cannot revoke individual JWT sessions before expiry (rotate `SESSION_SECRET` to invalidate all)
- Static allowlist — requires redeploy to add/remove editors

---

## Migration from TypeScript/Deno

This project was migrated from TypeScript/Deno to Elixir/Phoenix. See:
- `MIGRATION_GUIDE.md` - Detailed migration documentation
- `ELIXIR_MIGRATION_SUMMARY.md` - Quick overview
- `README_ELIXIR.md` - Elixir-specific documentation

The API remains 100% compatible with the original implementation.

---

## Development vs Production

| Aspect | Development | Production |
|--------|-------------|------------|
| Backend | Elixir standalone or Docker | OCI Container Instance |
| Frontend | Vite dev server (port 5173) | OCI Object Storage |
| `FRONTEND_URL` | Not set (empty) | Required (Object Storage URL) |
| Container Registry | Local Docker | OCI Container Registry |
| Cost | Free | ~$0.03/month |


