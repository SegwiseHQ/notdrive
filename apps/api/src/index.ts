import { serve } from '@hono/node-server';
import { buildApp } from './app.js';
import { sqliteClient, pgPool } from './db/index.js';
import { env, loadServerEnv } from './env.js';
import { startJobRunner } from './jobs/runner.js';
import { logger } from './util/logger.js';

const serverEnv = loadServerEnv();
const app = buildApp();
const stopJobs = startJobRunner();

const server = serve({ fetch: app.fetch, port: serverEnv.PORT }, (info) => {
  logger.info({ port: info.port, driver: env.DB_DRIVER }, 'api listening');
});

// Node's http.Server holds onto keep-alive connections, so plain server.close()
// can hang for the connection's idle timeout. Close idle + active connections
// aggressively so SIGINT/tsx-watch restarts are instant.
const nodeServer = server as unknown as {
  close: (cb?: () => void) => void;
  closeIdleConnections?: () => void;
  closeAllConnections?: () => void;
};

let shuttingDown = false;
const shutdown = (signal: string) => {
  if (shuttingDown) process.exit(1);
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');
  try {
    stopJobs();
  } catch {}
  try {
    nodeServer.closeIdleConnections?.();
    nodeServer.closeAllConnections?.();
  } catch {}
  nodeServer.close(() => {
    try {
      sqliteClient?.close();
    } catch {}
    pgPool?.end().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 1_500).unref();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGHUP', () => shutdown('SIGHUP'));

// Background work (appdata mirrors, Drive polling) can emit late stream errors
// that aren't awaited anywhere. Log them and keep the server running instead
// of crashing on a background side-effect.
process.on('uncaughtException', (err) => {
  logger.error({ err: err.message, stack: err.stack }, 'uncaughtException — continuing');
});
process.on('unhandledRejection', (reason) => {
  logger.error({ reason: String(reason) }, 'unhandledRejection — continuing');
});
