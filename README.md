# NotDrive

Notion-style organization layer for Google Drive.

## Stack

- **Monorepo**: pnpm workspaces, Node 22 LTS
- **API**: Hono + Drizzle + zod, SQLite (dev) / Postgres (prod)
- **Web**: Vite + React + TanStack Query + shadcn/ui + dnd-kit
- **Shared types**: Hono RPC (no codegen)

## Quickstart

```bash
# Backend env (root .env — covers everything the Hono API + jobs need)
cp .env.example .env
openssl rand -base64 32   # APP_ENCRYPTION_KEY
openssl rand -base64 32   # SESSION_SECRET
# Fill GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, the two keys above.

# Frontend env (Vite reads VITE_* from apps/web/.env)
cp apps/web/.env.example apps/web/.env

pnpm i
pnpm db:migrate
pnpm dev   # api on :3000, web on :5173
```

## Env vars at a glance

**Backend (`.env`)** — server URLs and CORS allow-list:

| Var | Purpose | Example |
| --- | --- | --- |
| `API_ORIGIN` | Where the API is reachable | `http://localhost:3000` |
| `WEB_ORIGIN` | Comma-separated allow-list of web origins for CORS | `http://localhost:5173` or `https://app.example.com,https://app-staging.example.com` |
| `GOOGLE_OAUTH_REDIRECT_URI` | Must match `${API_ORIGIN}/api/auth/google/callback` and the Google Cloud Console entry | |

**Frontend (`apps/web/.env`)** — points the bundle at the API:

| Var | Purpose | Example |
| --- | --- | --- |
| `VITE_API_ORIGIN` | URL the browser uses to talk to the API. Must equal `API_ORIGIN` and be in the API's `WEB_ORIGIN` list. | `http://localhost:3000` |

The two sides must agree:
- The **frontend's** `VITE_API_ORIGIN` is where it sends requests.
- The **backend's** `WEB_ORIGIN` decides whose `Origin` header the API will trust (CORS).
- Mismatch = browser blocks the request with a CORS error.

Postgres instead of SQLite:

```bash
docker compose --profile pg up -d postgres
DB_DRIVER=postgres DATABASE_URL=postgres://notdrive:notdrive@localhost:5432/notdrive pnpm db:migrate
DB_DRIVER=postgres DATABASE_URL=postgres://notdrive:notdrive@localhost:5432/notdrive pnpm dev
```

## Scripts

- `pnpm dev` — run api + web in parallel
- `pnpm lint` / `pnpm lint:fix`
- `pnpm typecheck`
- `pnpm test`
- `pnpm db:migrate` / `pnpm db:generate` / `pnpm db:studio`
- `pnpm jobs:run <name>` — run a background job once (drive-poll, archive-purge, session-gc, invite-gc)
