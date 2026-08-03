# NotDrive — Design & Operations Manual

Comprehensive reference for every architectural choice, every script, and every command in this repository. Use this as the onboarding doc and the operator runbook.

---

## 1. What NotDrive is

NotDrive is a Notion-style organisation and navigation layer over Google Drive. Users log in with Google, and NotDrive pulls Drive file metadata into a typed model that they can organise into a custom hierarchy, tag, search with a free-text query language, view through multiple layouts (list/grid/timeline/tagboard), and preview in-place. It is **not** a Drive replacement, a Docs editor, or a realtime collaboration tool. It is a structured read/organise surface that stays in sync with Drive through the Drive `/changes` API.

The product goal is <5 s file retrieval and a Notion-feel UX. All three TRD phases (hierarchy + CRUD, tags/search/favourites, views/smart-views) are implemented.

---

## 2. Top-level architecture

```
┌───────────────┐    fetch (cookie)    ┌──────────────────────┐     googleapis    ┌──────────────┐
│  apps/web     │ ───────────────────▶ │  apps/api (Hono)     │ ────────────────▶ │  Google      │
│  Vite + React │                      │  Drizzle + zod       │  OAuth + Drive v3 │  Drive API   │
└───────────────┘                      │  Background jobs     │                    └──────────────┘
        ▲                              └──────────┬───────────┘
        │ Hono RPC types                         │
        │                                        ▼
        │                               ┌──────────────────────┐
        │                               │ SQLite (dev)         │
        │                               │ Postgres (prod-ready)│
        │                               └──────────────────────┘
```

- Single-origin deployment is assumed per `API_ORIGIN` / `WEB_ORIGIN`.
- The web app never calls Google directly — all Drive access goes through the API so tokens stay server-side and encrypted.

---

## 3. Choice index (with rationale)

### 3.1 Repository shape — **pnpm workspaces monorepo**
- `apps/api` and `apps/web` both depend on `packages/shared` via `workspace:*`.
- Chosen over Turborepo because pipelines are simple; over Next.js fullstack because the backend needs long-lived background jobs and a distinct Hono surface; over sibling folders because shared types need real workspace wiring.

### 3.2 Language — **TypeScript strict (both sides)**
- `tsconfig.base.json` enables `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `isolatedModules`, `verbatimModuleSyntax: false`.
- Strict mode catches the biggest classes of bugs in a Drive-wrapper app (missing fields on API responses, nullable joins).

### 3.3 Runtime — **Node 24 LTS, pinned via Volta + nvmrc**
- `@hono/node-server` hosts Hono on Node. Bun was rejected to avoid platform quirks with `googleapis` and `better-sqlite3`.

### 3.4 API framework — **Hono**
- Tiny surface, Node-native, first-class middleware, and — crucially — an RPC client (`hc<AppType>`) that flows server route types to the browser with no codegen.
- `@hono/zod-validator` provides runtime validation; `zod` schemas live in `packages/shared` so client and server share one source of truth.

### 3.5 ORM — **Drizzle**
- SQL-first, strong type inference, supports both SQLite and Postgres from the same service code when column shapes are aligned (`integer({ mode: 'boolean' })` in SQLite matches `boolean` in PG).
- `drizzle-kit` generates and applies migrations; two parallel schema files live in `src/db/schema.sqlite.ts` and `src/db/schema.postgres.ts`, unified at runtime by `src/db/index.ts`.

### 3.6 Database — **SQLite in dev, Postgres in prod**
- SQLite for zero-setup dev (`better-sqlite3`, WAL mode, foreign keys ON).
- Postgres 18.4 via `docker-compose --profile pg` for prod parity tests.
- Toggle with `DB_DRIVER=sqlite|postgres` + `DATABASE_URL`.
- All timestamps are `unix-ms` integers on both sides to keep services portable.

### 3.7 Full-text search — **SQLite FTS5 / Postgres tsvector behind a driver seam**
- SQLite: virtual `items_fts` table with `porter unicode61` tokenizer; triggers keep it in sync with `items` and `drive_file_cache`.
- Postgres: generated `title_tsv` column on `items` + `GIN` index; `pg_trgm` for Drive filename search.
- `src/services/search.ts` evaluates the parsed AST by translating each terminal into a `Set<id>` (via FTS for text terms, typed joins for structured terms) and combining with set operations for AND/OR/NOT.

### 3.8 Authentication — **hand-rolled Google OAuth 2.0 with AES-GCM token storage**
- Scopes: `openid email profile https://www.googleapis.com/auth/drive` (full Drive, as chosen).
- Tokens stored in `oauth_accounts` with per-row IV + AES-256-GCM ciphertext; master key from `APP_ENCRYPTION_KEY` env (boot refuses to start if missing or not 32 bytes).
- Sessions: opaque 32-char IDs in DB, `sid` httpOnly cookie (SameSite=Lax, Secure in prod). Chosen over JWTs so sessions can be revoked by simply deleting the row; chosen over Lucia/Better Auth to keep dependency surface minimal and to preserve full control over the token-encryption boundary.
- `id_token` is verified via `google-auth-library`'s `verifyIdToken` in the callback.

### 3.9 Tenancy — **multi-user workspaces + invites**
- First login auto-creates `"<Name>'s Workspace"` with the user as owner.
- RBAC: `owner > admin > member > viewer`, compared via `ROLE_RANK`.
- Invites are email + token rows (`workspace_invites`); accepted by a logged-in user whose email matches.

### 3.10 Tree ordering — **LexoRank-style fractional ranks**
- `packages/shared/src/rank.ts` implements a 62-character base-62 midpoint algorithm with O(1) moves and no reindexing unless ranks collide past 8 digits (rare).
- Clients and servers share the same `between(prev, next)` helper so optimistic UI moves agree with server truth.
- Move endpoint: `PATCH /items/:id/move { parent_id, before_id? | after_id? }`.

### 3.11 Drive integration — **per-user Bottleneck + p-retry + 5-min LRU tree cache + `/changes` sync**
- `src/drive/client.ts` builds an authed `googleapis` client per user and persists auto-refreshed access tokens back through `oauth_accounts`.
- `src/drive/limiter.ts` keeps a per-user Bottleneck (8 rps, 100/min) and retries 429/403/5xx with exponential jitter.
- `src/drive/tree.ts` pre-fetches recursive folder trees up to `DRIVE_TREE_DEPTH` (default 4) for the file picker, cached 5 minutes in an LRU.
- `src/drive/changes.ts` performs incremental sync via `changes.getStartPageToken` → `changes.list`, persisted in `drive_sync_state`. On trash/remove, any item with the matching `drive_file_id` is auto-archived and an `item_events(kind='archived', reason='drive_trashed')` row is written.

### 3.12 Background jobs — **in-process interval loops with a DB lease lock**
- `src/jobs/runner.ts` ticks every 10 s and attempts to acquire each job's lease row in `job_leases`. Only the leader runs the job. Works under SQLite (single-process) and Postgres (multi-worker) without Redis.
- Jobs:
  - `drive-poll` every 60 s for any (workspace, user) with a session seen in the last 2 minutes.
  - `archive-purge` every 1 h hard-deletes items archived > 30 days.
  - `session-gc` every 15 m prunes expired sessions.
  - `invite-gc` every 1 h prunes expired invites.

### 3.13 Observability — **pino + pino-pretty (dev)**
- Request logging middleware emits `{ reqId, method, path, status, ms }` on every request.
- `pino.redact` strips `authorization`, `cookie`, `access_token`, `refresh_token` from logs.
- No OpenTelemetry in MVP; the shape leaves room to add it.

### 3.14 Frontend stack — **Vite + React Router + TanStack Query + Zustand + shadcn/Radix + dnd-kit + cmdk**
- Vite because the backend already owns API; no Next.js runtime overhead needed.
- React Router (data router) chosen over TanStack Router for familiarity.
- TanStack Query handles all server cache; `refetchOnWindowFocus: true` delivers the polling feel without realtime plumbing.
- Zustand for ui/selection/command/workspace stores that live outside server cache.
- shadcn-style primitives built on Radix; Tailwind for styling; dnd-kit for tree drag & drop.
- cmdk for the palette, which is backed by a **typed action registry** so keyboard shortcuts and palette entries share identical implementations (single source of truth).

### 3.15 Dev tooling — **Biome + tsc**
- Biome replaces ESLint + Prettier (one fast tool, minimal config).
- `biome.json` enforces organize-imports, strict unused detection, and the project's style (single quotes, trailing commas, 100-column wrap).

### 3.16 Security
- **Token encryption**: AES-256-GCM, 12-byte random nonce per row, auth tag concatenated to ciphertext.
- **Session cookies**: httpOnly + SameSite=Lax; upgraded to `__Host-` + Secure in prod.
- **CSRF**: Lax cookies + required `X-Workspace-Id` or `X-Requested-With` header on mutating requests, with a same-origin bypass for the API itself and an allow for `/auth/*` (GET only).
- **CORS**: explicit `WEB_ORIGIN` allow-list, `credentials: true`.
- **Secrets**: `APP_ENCRYPTION_KEY` and `SESSION_SECRET` are asserted to decode to 32 bytes at boot.

### 3.17 Deployment — **docker-compose for dev; prod infra deferred**
- `docker-compose.yml` starts Postgres (profile `pg`) and MailHog for invite emails in dev.
- Prod hosting decision is deliberately punted; code is single-node-safe and 12-factor.

---

## 4. Repository layout

```
/                                   repo root
├── package.json                    workspace root (scripts, lint-staged)
├── pnpm-workspace.yaml             workspace globs
├── tsconfig.base.json              shared strict TS options
├── biome.json                      lint + format config
├── docker-compose.yml              Postgres (profile: pg) + MailHog
├── .env.example                    every env var this project consumes
├── .nvmrc                          Node version pin
├── .gitignore
├── README.md                       quickstart
├── DESIGN.md                       ← this document
├── apps/
│   ├── api/                        Hono backend (see §6)
│   └── web/                        Vite React frontend (see §7)
└── packages/
    └── shared/                     zod/LexoRank/query parser/DTOs/enums
```

---

## 5. Environment variables (`.env.example`)

Every variable in one place. All are consumed by `apps/api/src/env.ts`, which validates with zod and refuses to boot on missing/invalid values. The web app reads only `VITE_API_ORIGIN` at build/dev time.

| Variable | Purpose | Notes |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | OAuth client ID | Create in Google Cloud Console with Drive API enabled |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret | |
| `GOOGLE_OAUTH_REDIRECT_URI` | Callback URL | Default `http://localhost:3000/api/auth/google/callback` |
| `APP_ENCRYPTION_KEY` | AES-256-GCM master key | base64 of 32 random bytes; `openssl rand -base64 32` |
| `SESSION_SECRET` | Reserved for future signed cookies | base64 of 32 random bytes |
| `API_ORIGIN` | Where the API is reachable | Used for CORS same-origin detection |
| `WEB_ORIGIN` | Where the web app is reachable | Allowed CORS origin |
| `DB_DRIVER` | `sqlite` (default) or `postgres` | Switches Drizzle driver |
| `DATABASE_URL` | File path or PG URL | `./notdrive.db` or `postgres://…` |
| `DRIVE_TREE_DEPTH` | Max depth for the prefetched Drive folder tree | Default `4` |
| `LOG_LEVEL` | pino level | Default `debug` in dev |
| `NODE_ENV` | Node environment | `development` / `production` |
| `PORT` | API port | Default `3000` |

---

## 6. apps/api — backend

### 6.1 Layout
```
apps/api/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── drizzle.config.ts
├── drizzle/                  generated migrations (sqlite/*, postgres/*)
├── src/
│   ├── index.ts              server bootstrap: buildApp + startJobRunner
│   ├── app.ts                Hono app wiring + error handler
│   ├── app-type.ts           exported AppType for Hono RPC
│   ├── context.ts            Variables typedef for c.get/c.set
│   ├── env.ts                zod-validated process.env
│   ├── auth/google.ts        OAuth client + URL builder + id_token verify
│   ├── crypto/secretbox.ts   AES-256-GCM seal/open
│   ├── db/
│   │   ├── schema.sqlite.ts  Drizzle SQLite schema
│   │   ├── schema.postgres.ts Drizzle Postgres schema
│   │   ├── index.ts          runtime driver switch
│   │   └── migrate.ts        runs migrations + FTS setup
│   ├── middleware/
│   │   ├── auth.ts           requireAuth (loads session + user)
│   │   ├── workspace.ts      requireWorkspace(minRole)
│   │   ├── cors.ts
│   │   ├── csrf.ts
│   │   └── requestLog.ts     pino + X-Request-Id
│   ├── routes/               auth, me, workspaces, items, itemTags, tags, views, search, drive, recent
│   ├── services/             tokens, workspaces, invites, items, tags, views, search, recent
│   ├── drive/                client, limiter, cache, tree, changes
│   ├── search/               driver seam + sqlite/postgres bootstraps
│   ├── jobs/                 runner, lease, drivePoll, archivePurge, sessionGc, inviteGc, cli
│   └── util/                 ids, errors, logger
└── test/                     vitest: crypto, search-driver
```

### 6.2 Database schema (portable across SQLite & Postgres)

| Table | Purpose | Notable columns / indexes |
| --- | --- | --- |
| `users` | identity | `google_id` uniq, `dark_mode` enum string |
| `oauth_accounts` | encrypted Google tokens | per-row `*_iv`, composite PK (user_id, provider) |
| `sessions` | opaque server sessions | `last_seen_at` used by drive-poll activity window |
| `workspaces` | top-level container | |
| `workspace_members` | join w/ role | composite PK, index on `user_id` |
| `workspace_invites` | email + token + role | uniq `token`, `expires_at` |
| `items` | hierarchical content | LexoRank `rank`, `(workspace_id, parent_id, rank)` index |
| `tags` | labels | case-insensitive uniq per workspace |
| `item_tags` | M:N | composite PK, index on `tag_id` |
| `views` | saved per-user smart views | `query` TEXT, `layout` enum, `sort` JSON |
| `item_events` | activity log | feeds Recent + analytics |
| `drive_file_cache` | Drive metadata snapshot | composite PK (drive_file_id, workspace_id) |
| `drive_sync_state` | per-(ws, user) page token | |
| `job_leases` | leader election | expiring row per job name |

### 6.3 API surface (all under `/`, JSON, cookie auth)

| Method | Path | Auth | Role | Purpose |
| --- | --- | --- | --- | --- |
| GET | `/api/auth/google/start` | — | — | Redirect to Google consent with state cookie |
| GET | `/api/auth/google/callback` | — | — | Exchange code, upsert user, create session, create workspace on first login |
| POST | `/api/auth/logout` | ✓ | — | Delete session + clear cookie |
| GET | `/me` | ✓ | — | User + workspaces + current role |
| PATCH | `/me` | ✓ | — | Update dark-mode preference |
| GET / POST | `/workspaces` | ✓ | — | List or create workspaces |
| POST | `/workspaces/invites/accept` | ✓ | — | Accept pending invite by token |
| GET | `/workspaces/:wsId/members` | ✓ | member | List members |
| POST | `/workspaces/:wsId/invites` | ✓ | admin | Create invite |
| PATCH | `/workspaces/:wsId/members/:uid` | ✓ | admin | Change role (owner required to set owner) |
| DELETE | `/workspaces/:wsId/members/:uid` | ✓ | owner | Remove member (last-owner guard) |
| GET | `/items` | ✓ | viewer | List by parent/archived/favourite flags |
| POST | `/items` | ✓ | member | Create (optional drive_file_id auto-caches) |
| GET | `/items/:id` | ✓ | viewer | Hydrated item + drive + tag ids |
| PATCH | `/items/:id` | ✓ | member | Rename / star |
| PATCH | `/items/:id/move` | ✓ | member | LexoRank-based move |
| POST | `/items/:id/open` | ✓ | viewer | Emit `opened` event |
| DELETE | `/items/:id` | ✓ | member | Soft-archive (hard-purge with `?hard=1` iff already archived) |
| POST | `/items/:id/restore` | ✓ | member | Un-archive |
| POST / DELETE | `/items/:id/link` | ✓ | member | Link / unlink a Drive file |
| POST / DELETE | `/items/:itemId/tags/:tagId` | ✓ | member | Attach / detach tag |
| GET / POST / PATCH / DELETE | `/tags…` | ✓ | viewer/member/admin | Tag CRUD |
| GET / POST / PATCH / DELETE | `/views…` | ✓ | viewer | Saved views (per user) |
| GET | `/search?q=` | ✓ | viewer | Free-text smart query |
| GET | `/recent` | ✓ | viewer | Deduped item events |
| GET | `/drive/tree?depth=…&root=…` | ✓ | viewer | Recursive Drive folder tree (cached 5 min) |
| GET | `/drive/files/:id` | ✓ | viewer | Metadata (cached 10 min) |
| POST | `/drive/sync` | ✓ | viewer | Manual `/changes` tick |
| GET | `/health` | — | — | Liveness |

### 6.4 Search query language

```
tag:<name>                    repeatable
mime:<substring>              matches cached Drive mimeType
modified:<op><value>          op = < > = ; value = Nd | YYYY-MM-DD
is:favorite|archived|page|file
in:<parent title substring>
"quoted phrase"
word1 word2                   default AND
AND  OR  NOT                  explicit operators (case-insensitive)
( … )                         grouping
```
Parser in `packages/shared/src/query.ts`, evaluator in `apps/api/src/services/search.ts`.

### 6.5 Background jobs

| Job | Cadence | Lease TTL | Gate |
| --- | --- | --- | --- |
| `drive-poll` | 60 s | 90 s | only (ws, user) pairs with a session `last_seen_at > now - 120s` |
| `archive-purge` | 1 h | 5 m | `is_archived = true AND archived_at < now - 30d` |
| `session-gc` | 15 m | 5 m | `expires_at < now` |
| `invite-gc` | 1 h | 5 m | `expires_at < now` |

Run a single job ad-hoc: `pnpm jobs:run drive-poll`.

### 6.6 API scripts (`apps/api/package.json`)

| Script | Command | Purpose |
| --- | --- | --- |
| `dev` | `tsx watch src/index.ts` | Hot-reload server on :3000 |
| `build` | `tsc -p tsconfig.json` | Emit JS to `dist/` |
| `start` | `node dist/index.js` | Run compiled output |
| `typecheck` | `tsc --noEmit` | Strict type check |
| `test` | `vitest run` | Unit tests (`test/**/*.test.ts`) |
| `db:generate` | `drizzle-kit generate` | Produce SQL migrations for the active driver |
| `db:migrate` | `drizzle-kit generate && tsx src/db/migrate.ts` | Generate + apply migrations + install FTS objects |
| `db:studio` | `drizzle-kit studio` | GUI to browse the DB |
| `jobs:run <name>` | `tsx src/jobs/cli.ts <name>` | Run one job tick (`drive-poll`, `archive-purge`, `session-gc`, `invite-gc`) |

---

## 7. apps/web — frontend

### 7.1 Layout
```
apps/web/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.cjs
├── index.html
└── src/
    ├── main.tsx             providers (QueryClient, Router, Toaster)
    ├── router.tsx           route tree
    ├── AppShell.tsx         sidebar / main / preview layout
    ├── index.css            Tailwind layers + theme tokens
    ├── lib/
    │   ├── api.ts           hc<AppType> client + workspace cookie header
    │   ├── http.ts          typed fetch helpers (all endpoints)
    │   ├── queryClient.ts   TanStack Query defaults
    │   ├── store.ts         Zustand: ui / selection / command / workspace
    │   ├── theme.ts         applies dark mode from store + system preference
    │   └── utils.ts         cn() helper
    ├── panes/
    │   ├── Sidebar.tsx      workspace switcher, sections, palette trigger
    │   └── PreviewPane.tsx  iframe preview + tag editor
    ├── features/
    │   ├── workspaces/WorkspaceSwitcher.tsx
    │   ├── tree/TreePanel.tsx          dnd-kit nested tree
    │   ├── tags/TagList.tsx, TagEditor.tsx
    │   ├── views/ViewsList.tsx         saved views + preset seeding
    │   └── drive-picker/DrivePicker.tsx recursive Drive tree modal
    ├── views/
    │   ├── ViewContainer.tsx
    │   ├── ListView.tsx
    │   ├── GridView.tsx
    │   ├── TimelineView.tsx
    │   └── TagboardView.tsx
    ├── commands/
    │   ├── registry.ts      typed action registry (single source of truth)
    │   ├── CommandPalette.tsx   cmdk UI
    │   └── hotkeys.ts       global keyboard shortcuts → registry
    └── pages/
        ├── LoginPage.tsx
        ├── WorkspacePicker.tsx
        ├── WorkspaceHome.tsx
        ├── ItemPage.tsx
        ├── ViewPage.tsx
        ├── TagPage.tsx
        ├── FavoritesPage.tsx
        ├── ArchivePage.tsx
        ├── RecentPage.tsx
        ├── MembersPage.tsx
        └── AcceptInvitePage.tsx
```

### 7.2 Routes

| Path | Component | Notes |
| --- | --- | --- |
| `/login` | `LoginPage` | Button redirects to `/api/auth/google/start` |
| `/invites/accept?token=…` | `AcceptInvitePage` | Accepts an invite and pivots into the workspace |
| `/` | `AppShell` → `WorkspacePicker` | Redirects to the user's first workspace |
| `/w/:wsId` | `WorkspaceHome` | Root items list |
| `/w/:wsId/i/:itemId` | `ItemPage` | Item editor + children + Drive picker (`?pick=1`) |
| `/w/:wsId/view/:viewId` | `ViewPage` | Saved view powered by `/search` |
| `/w/:wsId/tags/:tagId` | `TagPage` | Tag-scoped view (`tag:<name>`) |
| `/w/:wsId/favorites` | `FavoritesPage` | Starred items |
| `/w/:wsId/archive` | `ArchivePage` | Restore / hard-delete UI |
| `/w/:wsId/recent` | `RecentPage` | Per-user event feed |
| `/w/:wsId/settings/members` | `MembersPage` | Invite + role management |

### 7.3 State model

| Store | Fields | Purpose |
| --- | --- | --- |
| `useUi` | `sidebarCollapsed`, `previewOpen`, `darkOverride` | UI chrome + theme (persisted to localStorage + `PATCH /me`) |
| `useSelection` | `selectedItemId`, `expandedIds` | Tree expansion + preview target |
| `useCommand` | `open` | Palette visibility |
| `useWorkspace` | `activeWsId` | Source of the `X-Workspace-Id` header |

TanStack Query keys: `['me']`, `['items', wsId, parentId|'root']`, `['item', id]`, `['tags', wsId]`, `['views', wsId]`, `['drive-tree']`, `['search', wsId, q]`, `['recent', wsId]`, `['members', wsId]`.

### 7.4 Keyboard shortcuts / action registry

| Shortcut | Action ID | Effect |
| --- | --- | --- |
| `⌘K` | `open:palette` | Open command palette (also searches items) |
| `⌘N` | `item.create` | Create a new page under current context |
| `⌘\` | `ui.sidebar.toggle` | Hide/show sidebar |
| `⌘.` | `ui.preview.toggle` | Hide/show preview pane |
| `⌘1`–`⌘4` | `view.switch.list|grid|timeline|tagboard` | Switch current view layout |

Every palette entry is a `Command` with `{ id, title, section, keywords?, shortcut?, when?, run }`. Hotkeys simply look up commands by id, so the palette and shortcuts never drift apart.

### 7.5 Web scripts (`apps/web/package.json`)

| Script | Command | Purpose |
| --- | --- | --- |
| `dev` | `vite` | Start dev server on :5173 |
| `build` | `tsc -b && vite build` | Type-check + bundle to `dist/` |
| `preview` | `vite preview` | Serve `dist/` locally |
| `typecheck` | `tsc --noEmit` | Strict type check |
| `test` | `vitest run` | Unit tests |

---

## 8. packages/shared

| File | Exports |
| --- | --- |
| `enums.ts` | `ITEM_TYPES`, `ROLES`, `ROLE_RANK`, `roleAtLeast`, `VIEW_LAYOUTS`, `DARK_MODES`, `EVENT_KINDS`, `TAG_COLORS` |
| `rank.ts` | `between(prev?, next?)`, `sequence(count, after?)`, `INITIAL_RANK` |
| `query.ts` | `parseQuery`, `collectTerms`, `resolveModifiedToEpochMs`, `QueryParseError`, types `Ast`, `Term`, `ModifiedValue`, `CmpOp` |
| `zod.ts` | Every request-body / query zod schema used by the API |
| `dto.ts` | TS types for responses (`MeDTO`, `ItemDTO`, `TagDTO`, `ViewDTO`, `DriveFileDTO`, `DriveTreeNode`, `RecentEntryDTO`, …) |
| `index.ts` | Re-exports everything |

| Script | Command | Purpose |
| --- | --- | --- |
| `typecheck` | `tsc --noEmit` | |
| `test` | `vitest run` | Tests for `rank` and `query` |

---

## 9. Root scripts (monorepo)

Run from the repo root.

| Script | Command | Purpose |
| --- | --- | --- |
| `pnpm dev` | `pnpm -r --parallel --filter './apps/*' run dev` | Start api + web together |
| `pnpm dev:api` | Filter to `@notdrive/api` | API only |
| `pnpm dev:web` | Filter to `@notdrive/web` | Web only |
| `pnpm build` | `pnpm -r run build` | Build everything |
| `pnpm typecheck` | `pnpm -r run typecheck` | Strict check everywhere |
| `pnpm lint` | `biome check .` | Biome lint pass |
| `pnpm lint:fix` | `biome check --write .` | Lint + auto-fix + organize imports |
| `pnpm test` | `pnpm -r run test` | All Vitest suites |
| `pnpm db:migrate` | filter → `drizzle-kit generate && tsx src/db/migrate.ts` | Generate + apply migrations + install FTS |
| `pnpm db:generate` | filter → `drizzle-kit generate` | Just generate migration SQL |
| `pnpm db:studio` | filter → `drizzle-kit studio` | DB GUI |
| `pnpm jobs:run <name>` | filter → `tsx src/jobs/cli.ts <name>` | Run one job tick |

---

## 10. Docker Compose services

| Service | Profile | Why |
| --- | --- | --- |
| `postgres` (18.4-alpine) | `pg` | Prod-shape DB for parity testing; exposed on `:5432` (`notdrive`/`notdrive`). |
| `mailhog` | default | Runs Mailpit to capture invite emails locally at `http://localhost:8025` (UI) / `:1025` SMTP. |

Useful commands:
```bash
docker compose up -d mailhog              # always-on local SMTP via Mailpit
docker compose --profile pg up -d postgres  # opt-in Postgres
docker compose logs -f postgres           # tail logs
docker compose --profile pg down          # stop PG
```

---

## 11. End-to-end local setup

```bash
cp .env.example .env
openssl rand -base64 32 > /tmp/k1  # APP_ENCRYPTION_KEY
openssl rand -base64 32 > /tmp/k2  # SESSION_SECRET
# edit .env and paste both, plus GOOGLE_CLIENT_ID/SECRET

pnpm i
pnpm db:migrate                        # creates notdrive.db + FTS5 objects
pnpm dev                               # api :3000, web :5173
```

Switch to Postgres:
```bash
docker compose --profile pg up -d postgres
DB_DRIVER=postgres \
DATABASE_URL=postgres://notdrive:notdrive@localhost:5432/notdrive \
pnpm db:migrate
DB_DRIVER=postgres \
DATABASE_URL=postgres://notdrive:notdrive@localhost:5432/notdrive \
pnpm dev
```

---

## 12. Verification playbook

The §13 plan listed 15 manual + automated checks. The authoritative list is in `/Users/shobhit/.claude/plans/trd-notdrive-a-notion-style-nested-spark.md`. Highlights:

1. `pnpm i && pnpm db:migrate && pnpm dev` boots both apps.
2. Visit `/` → Google login → auto-created workspace → `/me` returns owner role.
3. Cmd+K opens the palette; `⌘N` creates a page; `⌘1`–`⌘4` switch layouts.
4. Drag an item to reorder — LexoRank invariants verified by `packages/shared/test/rank.test.ts`.
5. `pnpm --filter @notdrive/shared test` runs rank + query parser tests.
6. `pnpm --filter @notdrive/api test` runs crypto seal/open + search-driver tests.
7. Link a Drive file, then trash it in Drive UI; within ~90 s the item auto-archives.
8. Set `archived_at` to > 30 days ago, then `pnpm jobs:run archive-purge` → row hard-deleted.
9. Invite a second account as `viewer`; mutating requests return 403.
10. Toggle dark mode → reload in another tab → preference persists via `PATCH /me`.

---

## 13. Operational runbook

### 13.1 Drive token issues
- If `/drive/*` returns 401, the refresh token is bad or absent. Force a re-auth: visit `/api/auth/google/start`. The OAuth start route asks `access_type=offline&prompt=consent` so a new refresh token is always returned.

### 13.2 Rate-limit storms
- Bottleneck plus p-retry mitigates; if logs show sustained 429s, inspect `apps/api/src/drive/limiter.ts` and tune `minTime` / `reservoir`.

### 13.3 Archive purge "why didn't it run"
- Check `job_leases` — the row holds the current leader's id until `expires_at`. If stuck, manually `DELETE FROM job_leases WHERE name = 'archive-purge'` and wait 10 s.

### 13.4 Rotating the encryption key
- Generate a new `APP_ENCRYPTION_KEY`, but do so **with** a migration script that reads, decrypts with the old key, and re-seals with the new key. Not included in MVP; planned under unresolved question 11.

### 13.5 Backups
- SQLite: copy `notdrive.db` + `-wal` + `-shm` files.
- Postgres: `pg_dump -Fc`.

---

## 14. Unresolved questions (carried from the plan)

1. Workspace switcher — URL prefix vs dropdown (current: URL prefix).
2. File-item click — preview first vs open in Drive tab (current: preview first).
3. Invite email transport — MailHog in dev; prod provider TBD.
4. Member removal — keep `created_by` history vs reassign (current: keep).
5. Drive tree depth default — 4 (configurable via `DRIVE_TREE_DEPTH`).
6. Grid thumbnails — proxy via API vs `iconLink`.
7. Tag rename uniqueness — case-insensitive uniq confirmed.
8. Viewer-private views — allowed (views are per-user).
9. Purge cadence — 30 days, workspace-level override TBD.
10. Cmd+K "New item" parent — currently uses current item as parent.
11. Encryption key rotation procedure — to be designed.

---

## 15. Where to go next

- Plan file: `/Users/shobhit/.claude/plans/trd-notdrive-a-notion-style-nested-spark.md`
- Quickstart: `README.md`
- API entry: `apps/api/src/index.ts`
- Web entry: `apps/web/src/main.tsx`
- Shared contracts: `packages/shared/src/index.ts`
