# syntax=docker/dockerfile:1.7
# Multi-stage build for @notdrive/api.
# Stages: builder (compile bundle) -> deps (prod node_modules for native modules)
#         -> runtime (slim image with just what's needed to run).

############################
# 1) Builder: bundle the api
############################
FROM node:22-bookworm-slim AS builder
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=1
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate \
 && apt-get update \
 && apt-get install -y --no-install-recommends python3 build-essential pkg-config ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Manifests first for layer caching.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/shared/package.json ./packages/shared/package.json

RUN pnpm install --frozen-lockfile

# Sources.
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# Produce dist/{index.js, migrate.js, jobs-cli.js}. @notdrive/shared is inlined.
RUN pnpm --filter @notdrive/api build

###################################################
# 2) Deps: production-only install for native deps
###################################################
FROM node:22-bookworm-slim AS deps
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=1
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate \
 && apt-get update \
 && apt-get install -y --no-install-recommends python3 build-essential pkg-config ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/shared/package.json ./packages/shared/package.json

# `--prod` skips devDependencies. We only need this for native modules the
# esbuild bundle externalized (better-sqlite3, pg). Everything else is bundled.
RUN pnpm install --frozen-lockfile --prod --filter @notdrive/api

#######################
# 3) Runtime: slim image
#######################
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000

# tini gives us proper PID 1 signal handling (SIGTERM -> graceful shutdown).
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini ca-certificates curl \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd -r app && useradd -r -g app -d /app -s /usr/sbin/nologin app

# Mirror the workspace layout so pnpm's relative symlinks under
# apps/api/node_modules/ still resolve to /app/node_modules/.pnpm/...
WORKDIR /app/apps/api

# Workspace store (the actual package files live here under .pnpm/).
COPY --from=deps /app/node_modules /app/node_modules
# Per-workspace symlinks for @notdrive/api's deps (better-sqlite3, pg, etc.).
COPY --from=deps /app/apps/api/node_modules /app/apps/api/node_modules

# Bundle output + migration SQL files.
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/drizzle ./drizzle

# Root .env baked into the image. dotenv in env.ts walks up from dist/ and
# picks up /app/.env. WARNING: this embeds secrets in the image — only push
# this image to private registries you trust.
COPY .env /app/.env

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
 && chown -R app:app /app

USER app
EXPOSE 3000

# Traefik can use this directly, but having an in-image healthcheck helps ECS too.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-3000}/health" || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
