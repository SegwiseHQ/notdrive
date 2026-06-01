# NotDrive

**A Notion-style organization layer for Google Drive.** Self-hostable, multi-tenant, open source.

NotDrive sits on top of your Google Drive and gives you the things Drive doesn't: a tree-organized sidebar, tags, rich-text pages, saved smart-filter views, full-text search across both your Drive files and your own pages, and a Notion-feel UI — without moving any of your files off Drive. Your documents stay where they are; NotDrive just gives them a structured navigation surface.

![NotDrive screenshot placeholder](./icon.png)

---

## Why NotDrive

| Want | Notion | Google Drive | NotDrive |
|---|---|---|---|
| Tree-organized pages | ✅ | ❌ (flat folders) | ✅ |
| Rich-text editor | ✅ | ✅ (Docs) | ✅ |
| Files stay in Drive (yours, exportable, no lock-in) | ❌ | ✅ | ✅ |
| Tag-based filtering | ✅ | ❌ | ✅ |
| Saved smart views (`tag:design AND modified:<7d`) | ❌ | ❌ | ✅ |
| Full-text search across pages + Drive files | partial | ✅ | ✅ |
| Per-page privacy (private to one user) | ✅ | per-file ACL | ✅ |
| Self-hostable | ❌ | ❌ | ✅ |
| Import from Outline / markdown ZIP | partial | ❌ | ✅ |

**Use NotDrive if:** your team's docs live in Google Drive and you wish Drive had a real navigation tree, tags, smart views, and a rich-text page editor — without giving up Drive as the source of truth.

**Don't use NotDrive if:** you want a Drive replacement (it isn't), real-time collaborative editing on the same page (use Google Docs), or a public-facing CMS.

---

## Features

### Core
- **Tree-organized pages** — drag-drop reordering with fractional-rank ordering, infinite nesting, instant moves.
- **Rich-text editor** — TipTap-based, markdown shortcuts, task lists, slash commands.
- **Link Drive files into your tree** — any Drive file (Doc, Sheet, Slide, PDF, image, video) can be linked as a page; preview inline, edit in Google.
- **Tags** — workspace-wide, case-insensitive, colored, drag-drop tagging.
- **Smart views** — saved queries with sort + layout (list/grid/timeline/tagboard). Query language: `tag:design AND mime:pdf modified:<7d -is:archived`.
- **Full-text search** — Cmd+K palette searches page titles, **page bodies**, Drive filenames, and tags. SQLite FTS5 / Postgres tsvector behind a driver seam.
- **Per-user favorites** — star pages for yourself; doesn't affect what teammates see.
- **Per-page privacy** — mark pages private to yourself; whole subtrees inherit. Cascades on flip.
- **Archive + trash** — soft archive with 30-day purge; restore anytime.
- **Recent items** — per-user view based on what you actually opened.

### Workspace / collaboration
- **Multi-workspace** — users belong to one or more workspaces.
- **Invites** — email-based with role assignment (owner / admin / member / viewer).
- **Auto-share** — optional auto-grant Drive permissions to workspace members when a file is linked.

### Drive integration
- **Direct Drive sync** — `changes.list` polling keeps file metadata fresh; trash detection auto-archives linked items.
- **Per-user rate limiting** — Bottleneck (8 rps / 100 per minute per user) + exponential-jitter retry on 429/5xx.
- **Drive file picker** — recursive tree browser, configurable depth, 5-minute LRU cache.
- **AppData mirroring** — page bodies optionally mirrored to your Drive `appDataFolder` for durability.

### Import / migration
- **Outline ZIP import** — handles Outline's `parent.md + parent/children/` pattern, dedupes accidentally-duplicated entries, preserves folder hierarchy as page tree.
- **Private import option** — entire imported tree visible only to the importer.

### Operations
- **Background jobs** — interval loops with DB-lease leader election (no Redis): drive-poll, archive-purge, session-gc, invite-gc.
- **Structured logs** — pino JSON with sensitive-field redaction.
- **Idempotent migrations** — Drizzle migrations run on every API boot; safe to deploy repeatedly.
- **Health endpoint** — `GET /health` for load balancers.

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Monorepo | pnpm workspaces | Two apps + shared types, minimal tooling. |
| Runtime | Node 22 LTS | Pinned via Volta/.nvmrc. |
| API framework | [Hono](https://hono.dev) | Tiny, fast, RPC types flow to client without codegen. |
| Validation | [Zod](https://zod.dev) | Schemas shared between API + web via `packages/shared`. |
| ORM | [Drizzle](https://orm.drizzle.team) | SQL-first, strong types, works on SQLite + Postgres from one codebase. |
| Database | SQLite (dev) / Postgres (prod) | Toggle via `DB_DRIVER`. Same service code. |
| Search | SQLite FTS5 / Postgres tsvector | HTML-stripped body + title weighted index. |
| Auth | Google OAuth 2.0 + AES-GCM token storage | Sessions stored server-side, revocable. |
| Frontend | Vite + React 18 + TanStack Query | Fast HMR, server-state cache. |
| UI primitives | Radix UI + Tailwind + shadcn/ui patterns | Headless components, design control. |
| Editor | TipTap | Extensible rich-text + slash menu. |
| DnD | dnd-kit | Sidebar drag-reorder. |
| Bundler (API prod) | esbuild | Single-file bundle for Docker; ~26 MB including all deps. |

---

## Quick start (local development)

### Prerequisites

- Node 22 (`volta install node@22` or `nvm install 22`)
- pnpm 9 (`corepack enable && corepack prepare pnpm@9.12.0 --activate`)
- A Google Cloud project with OAuth credentials (see [Google OAuth setup](#google-oauth-setup) below)

### Setup

```bash
git clone https://github.com/SegwiseHQ/notdrive.git
cd notdrive

# 1. Backend env — server URLs, secrets, Google OAuth
cp .env.example .env
# Generate two random secrets:
openssl rand -base64 32      # paste into APP_ENCRYPTION_KEY
openssl rand -base64 32      # paste into SESSION_SECRET
# Fill GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (see Google OAuth setup)

# 2. Frontend env — points the browser at the API
cp apps/web/.env.example apps/web/.env

# 3. Install + migrate + run
pnpm install
pnpm db:migrate
pnpm dev
```

Visit **http://localhost:5173** and sign in with Google. The API runs on **:3000**.

A SQLite database is created automatically at `apps/api/notdrive.db`. Delete it any time to reset.

---

## Configuration

### Environment variables — backend (`.env`)

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `development` / `test` / `production` |
| `PORT` | no | `3000` | API listen port |
| `LOG_LEVEL` | no | `debug` | `trace` / `debug` / `info` / `warn` / `error` |
| `DB_DRIVER` | no | `sqlite` | `sqlite` or `postgres` |
| `DATABASE_URL` | no | `./notdrive.db` | SQLite path or Postgres connection string |
| `DATABASE_SSL` | no | `disable` | Postgres-only: `disable` / `require` / `no-verify` |
| `DATABASE_SSL_CA` | no | — | Optional path to CA cert (e.g. AWS RDS bundle) when `DATABASE_SSL=require` |
| `APP_ENCRYPTION_KEY` | **yes** | — | base64 32-byte key. Encrypts stored Drive OAuth tokens. |
| `SESSION_SECRET` | **yes** | — | base64 32-byte key. Signs session cookies. |
| `GOOGLE_CLIENT_ID` | **yes** | — | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | **yes** | — | From Google Cloud Console |
| `GOOGLE_OAUTH_REDIRECT_URI` | **yes** | — | Must equal `${API_ORIGIN}/api/auth/google/callback` and be registered in Google Console |
| `API_ORIGIN` | **yes** | — | Where the API is reachable (scheme + host + port, no trailing slash) |
| `WEB_ORIGIN` | **yes** | — | Comma-separated allow-list of web origins for CORS |
| `DRIVE_TREE_DEPTH` | no | `4` | How deep Drive folder picker pre-fetches (1–6) |
| `ALLOWED_EMAIL_DOMAINS` | no | empty | Comma-separated list to restrict sign-in (e.g. `acme.com,contractor.com`). Empty = no restriction. |

### Environment variables — frontend (`apps/web/.env`)

| Variable | Required | Purpose |
|---|---|---|
| `VITE_API_ORIGIN` | yes | URL the browser uses to call the API. Must equal backend's `API_ORIGIN`. |

**The two sides must agree.** Frontend `VITE_API_ORIGIN` is where requests go; backend `WEB_ORIGIN` decides whose `Origin` header the API will trust. Mismatch = CORS error.

### Generating the required secrets

```bash
# APP_ENCRYPTION_KEY (encrypts Drive OAuth tokens at rest)
openssl rand -base64 32

# SESSION_SECRET (signs session cookies)
openssl rand -base64 32
```

Both must be base64-encoded 32-byte values. The API refuses to boot if either is missing or too short.

---

## Google OAuth setup

1. Go to **[Google Cloud Console](https://console.cloud.google.com/)** → create or pick a project.
2. **APIs & Services → Library** → enable **Google Drive API**.
3. **APIs & Services → OAuth consent screen**:
   - User type: External (or Internal if you have Workspace).
   - Add scopes: `openid`, `email`, `profile`, `https://www.googleapis.com/auth/drive`.
   - Add yourself as a test user if the app is in testing mode.
4. **Credentials → Create Credentials → OAuth client ID**:
   - Application type: Web application.
   - **Authorized JavaScript origins**: your `WEB_ORIGIN` value(s).
     - Local dev: `http://localhost:5173`
     - Prod: `https://your-app.example.com`
   - **Authorized redirect URIs**: your `GOOGLE_OAUTH_REDIRECT_URI`.
     - Local dev: `http://localhost:3000/api/auth/google/callback`
     - Prod: `https://api.your-app.example.com/api/auth/google/callback`
5. Save and copy the **Client ID** + **Client Secret** into your `.env`.

**Scopes used:** `drive` (full Drive access). Required for the file picker, change tracking, and AppData mirroring. NotDrive never moves or deletes Drive files outside explicit user actions.

---

## Database

### SQLite (default — zero setup)

Just run `pnpm db:migrate`. Creates `apps/api/notdrive.db` with WAL mode and FTS5 enabled. Suitable for single-user, single-instance deployments.

### Postgres (recommended for multi-user / multi-instance)

```bash
# Local Postgres via docker-compose:
docker compose --profile pg up -d postgres
DB_DRIVER=postgres \
DATABASE_URL=postgres://notdrive:notdrive@localhost:5432/notdrive \
  pnpm db:migrate

DB_DRIVER=postgres \
DATABASE_URL=postgres://notdrive:notdrive@localhost:5432/notdrive \
  pnpm dev
```

### Hosted Postgres (RDS, Neon, Supabase, etc.)

Set in `.env`:

```dotenv
DB_DRIVER=postgres
DATABASE_URL=postgres://USER:PASS@HOST:5432/notdrive?sslmode=require
DATABASE_SSL=require
```

For **AWS RDS** with the AWS CA bundle:

```dotenv
DATABASE_SSL=require
DATABASE_SSL_CA=/etc/ssl/rds-global-bundle.pem
```

Download the bundle from `https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem`.

For **quick testing** with self-signed certs:

```dotenv
DATABASE_SSL=no-verify
```

(Acceptable on private networks only — encrypts but skips chain validation.)

### Migrations

```bash
pnpm db:migrate     # apply all pending
pnpm db:generate    # generate new from schema changes
pnpm db:studio      # browse data in Drizzle Studio
```

The API's Docker entrypoint runs migrations on container start. Safe to re-run; idempotent.

---

## Production deployment

### Docker (recommended)

A multi-stage `Dockerfile` is included that produces a ~250 MB image:

```bash
# Build (use --platform linux/amd64 from Apple Silicon for x86 servers):
docker build -t notdrive-api:latest .

# Run:
docker run --rm -p 3000:3000 --env-file .env notdrive-api:latest
```

The container:
- Runs migrations on start (`docker-entrypoint.sh`).
- Uses `tini` as PID 1 for clean SIGTERM handling.
- Runs as non-root user `app`.
- Exposes `/health` for load balancer checks.
- Set `SKIP_MIGRATE=1` to skip auto-migrate (for multi-replica deploys where you run migrations as a one-off task).

### Frontend deployment

The frontend is a static Vite build:

```bash
pnpm --filter @notdrive/web build
# Outputs to apps/web/dist/ — deploy to S3+CloudFront, Cloudflare Pages,
# Vercel, Netlify, AWS Amplify Hosting, etc.
```

Set `VITE_API_ORIGIN` at **build time** (it's compiled into the bundle).

**One rewrite rule required**: imported and uploaded images are stored with
relative URLs like `/item-assets/<id>` so the same HTML works in any
deployment. The frontend host needs to rewrite that path to the API:

| Host | How |
|---|---|
| AWS Amplify | Hosting → Rewrites and redirects → add: source `/item-assets/<*>`, target `https://api.example.com/item-assets/<*>`, type `200 (Rewrite)` |
| Cloudflare Pages | `_redirects` file: `/item-assets/* https://api.example.com/item-assets/:splat 200` |
| Netlify | `_redirects` file: same syntax as Cloudflare Pages |
| Nginx | `location /item-assets/ { proxy_pass https://api.example.com; }` |

Vite dev does this automatically via `vite.config.ts`'s proxy block.

### Behind a reverse proxy (Traefik / nginx / NLB)

Common setup:

- Web app at `app.example.com` (static hosting or Vite SPA).
- API at `api.example.com` (this Docker container behind Traefik).
- Postgres on RDS or self-managed.

Example Traefik labels for the API container:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.notdrive_api.rule=Host(`api.example.com`)"
  - "traefik.http.routers.notdrive_api.entrypoints=websecure"
  - "traefik.http.routers.notdrive_api.tls.certresolver=myresolver"
  - "traefik.http.services.notdrive_api.loadbalancer.server.port=3000"
networks:
  - traefik-net
```

### Resource sizing

- **API container**: 256–512 MB RAM, 0.25–1 vCPU. Idles low; spikes during Drive sync.
- **Postgres**: tiny — most workloads fit comfortably in db.t4g.micro (1 GB) for hundreds of users.
- **Frontend bundle**: ~1 MB gzipped, served from CDN.

### Reliability

- All API endpoints are idempotent or correctly-versioned. Multi-replica safe.
- Background jobs use a DB-lease lock — only one replica runs each job at a time.
- Session cookies are signed, server-validated, revocable by deletion.
- Drive OAuth tokens are encrypted at rest (AES-256-GCM).

---

## Self-hosting checklist

1. [ ] Choose a host (any Docker-capable platform: ECS, Fly, Render, Railway, k8s, plain VPS).
2. [ ] Provision Postgres (RDS, Neon, Supabase, or self-managed).
3. [ ] Create Google OAuth credentials (see [Google OAuth setup](#google-oauth-setup)).
4. [ ] Generate `APP_ENCRYPTION_KEY` and `SESSION_SECRET` with `openssl rand -base64 32`.
5. [ ] Build + push the Docker image to your registry.
6. [ ] Deploy the API container with all env vars set.
7. [ ] Build + deploy the frontend (`apps/web/dist`) to your CDN/static host.
8. [ ] Point `app.example.com` → frontend; `api.example.com` → API container.
9. [ ] Update Google Cloud Console redirect URI to match prod.
10. [ ] Smoke test: visit `https://app.example.com`, sign in, link a Drive file.

For ongoing operations:

- Watch the `/health` endpoint for liveness.
- Tail container logs (pino JSON, parseable by Datadog, Loki, CloudWatch).
- Back up Postgres regularly (the app holds workspace state, user accounts, page bodies — not Drive files themselves).

---

## Project structure

```
notdrive/
├── apps/
│   ├── api/                    Hono API + background jobs
│   │   ├── src/
│   │   │   ├── routes/         HTTP endpoints (auth, items, workspaces, search, drive, import, …)
│   │   │   ├── services/       Business logic (items, search, importer, recent, autoShare, …)
│   │   │   ├── middleware/     auth, workspace context, CORS, request logging, CSRF
│   │   │   ├── drive/          Google Drive client, rate limiting, change tracking, AppData mirror
│   │   │   ├── search/         FTS5 (SQLite) + tsvector (Postgres) setup
│   │   │   ├── db/             Drizzle schemas (sqlite + postgres) + migration runner
│   │   │   ├── jobs/           Background loop runner + individual jobs
│   │   │   ├── auth/           Google OAuth + AES-GCM token storage
│   │   │   └── util/           ids, errors, logger
│   │   ├── drizzle/            Generated migration SQL
│   │   └── scripts/build.mjs   esbuild bundler for prod
│   └── web/                    Vite + React frontend
│       └── src/
│           ├── pages/          Top-level routes
│           ├── panes/          Layout (Sidebar, App shell)
│           ├── features/       Editor, drive-picker, tags, share dialogs, views, workspaces
│           ├── commands/       Cmd+K palette + hotkeys + command registry
│           ├── lib/            HTTP client, hooks, stores (zustand)
│           └── components/     Shared UI primitives
├── packages/shared/            Cross-app types + zod schemas + fractional-rank helper
├── docker-compose.yml          Local Postgres + mailhog
├── Dockerfile                  Multi-stage prod build
├── docker-entrypoint.sh        Migration + start
├── DESIGN.md                   Detailed architecture + decision log
└── README.md                   This file
```

See **[DESIGN.md](./DESIGN.md)** for the full architecture decision record — every choice with its rationale.

---

## Development

### Scripts

```bash
pnpm dev              # API + web in parallel
pnpm dev:api          # API only
pnpm dev:web          # Web only

pnpm build            # All packages
pnpm typecheck        # tsc --noEmit across the workspace
pnpm test             # vitest in api + shared + web

pnpm lint             # biome check
pnpm lint:fix         # biome check --write

pnpm db:migrate       # Apply pending migrations
pnpm db:generate      # Generate new migration from schema changes
pnpm db:studio        # Drizzle Studio (browse data)

pnpm jobs:run <name>  # Run a single job once (drive-poll, archive-purge, session-gc, invite-gc)
```

### Code style

- **Biome** handles formatting + linting. Run `pnpm lint:fix` before committing.
- TypeScript strict mode is enforced everywhere.
- Shared types live in `packages/shared/src/`; both API and web import from `@notdrive/shared`.
- Zod schemas in `packages/shared/src/zod.ts` are the single source of truth for request/response shapes.

### Hono RPC types

The frontend gets type-safe API access via `hc<AppType>` without codegen. Adding a new endpoint:

1. Define a zod schema in `packages/shared/src/zod.ts`.
2. Add the route handler in `apps/api/src/routes/`.
3. Re-export `AppType` from `apps/api/src/app-type.ts`.
4. Call it from the web side with full type safety: `api.items[':id'].$get({ param: { id } })`.

### Adding a new background job

1. Create `apps/api/src/jobs/<name>.ts` exporting `run(): Promise<void>`.
2. Register it in `apps/api/src/jobs/runner.ts` with its interval.
3. Add `<name>` to the CLI in `apps/api/src/jobs/cli.ts`.

The DB-lease lock (`job_leases` table) ensures only one replica runs each job at a time.

---

## Roadmap

**Done:**
- Hierarchy + CRUD + drag-drop
- Tags + colored
- Full-text search (title + body) with query language
- Smart views (saved queries + sort + layout)
- Per-user favorites
- Per-page privacy (owner-only)
- Outline ZIP import (markdown)
- Drive change sync (auto-archive on trash)
- Workspace invites with RBAC
- Multi-workspace per user

**Planned / considered:**
- Per-user item sharing (Mode A — "share with Alice and Bob", layers on existing `visibility`/`owner_id` columns)
- Comments / threaded discussion on pages
- Public-link sharing (read-only)
- Bidirectional Drive picker for adding files anywhere in the tree
- Mobile-friendly UI
- Image embeds with Drive AppData backing
- Notion / Confluence import paths

PRs welcome for any of these.

---

## Contributing

1. Fork and clone.
2. Branch off `main`.
3. Run `pnpm install && pnpm db:migrate && pnpm dev`.
4. Make changes. Add tests where it matters (`pnpm test`).
5. `pnpm lint:fix && pnpm typecheck` must pass.
6. Open a PR with a clear description. Include screenshots for UI changes.

Bug reports and feature requests welcome via GitHub Issues.

### Testing locally against a real database

```bash
docker compose --profile pg up -d postgres
DB_DRIVER=postgres DATABASE_URL=postgres://notdrive:notdrive@localhost:5432/notdrive pnpm db:migrate
DB_DRIVER=postgres DATABASE_URL=postgres://notdrive:notdrive@localhost:5432/notdrive pnpm dev
```

### Code reviews

- Keep PRs scoped — one feature or fix per PR.
- Include the migration in the same PR as the schema change.
- Add a "Review order" section in the PR description for non-trivial diffs.

---

## License

MIT — see [LICENSE](./LICENSE).

You can use, modify, fork, and self-host commercially without restriction. If you build something cool with it, we'd love to hear about it.

---

## Acknowledgments

Built with [Hono](https://hono.dev), [Drizzle](https://orm.drizzle.team), [Vite](https://vitejs.dev), [React](https://react.dev), [TanStack Query](https://tanstack.com/query), [TipTap](https://tiptap.dev), [Radix UI](https://radix-ui.com), [Tailwind](https://tailwindcss.com), [dnd-kit](https://dndkit.com), [Zod](https://zod.dev), and the broader open-source ecosystem.

Designed as a real-world product for [Segwise](https://segwise.ai)'s internal knowledge management; open-sourced because nothing in this category was good enough.
