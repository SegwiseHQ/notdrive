#!/bin/sh
# Run DB migrations on container start, then hand off to the API process.
# Set SKIP_MIGRATE=1 to bypass (useful if migrations run as a separate ECS task).
set -eu

# Migrations and the API inherit the same runtime-injected environment.
if [ "${SKIP_MIGRATE:-0}" != "1" ]; then
  echo "[entrypoint] running migrations (driver=${DB_DRIVER:-sqlite})"
  node dist/migrate.js
fi

echo "[entrypoint] starting api"
exec "$@"
