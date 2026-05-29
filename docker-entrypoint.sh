#!/bin/sh
# Run DB migrations on container start, then hand off to the API process.
# Set SKIP_MIGRATE=1 to bypass (useful if migrations run as a separate ECS task).
set -eu

# Surface DB_DRIVER from /app/.env if not already set in the container env,
# so the entrypoint log message matches what the Node process will actually use.
if [ -z "${DB_DRIVER:-}" ] && [ -f /app/.env ]; then
  DB_DRIVER=$(grep -E '^DB_DRIVER=' /app/.env | tail -n1 | cut -d= -f2- | tr -d '"' | tr -d "'")
fi

if [ "${SKIP_MIGRATE:-0}" != "1" ]; then
  echo "[entrypoint] running migrations (driver=${DB_DRIVER:-sqlite})"
  node dist/migrate.js
fi

echo "[entrypoint] starting api"
exec "$@"
