import { pino } from 'pino';
import pretty from 'pino-pretty';
import { env } from '../env.js';

const redact = {
  paths: [
    'req.headers.authorization',
    'req.headers.cookie',
    'access_token',
    'refresh_token',
    '*.access_token',
    '*.refresh_token',
  ],
  remove: true,
};

// Synchronous pretty stream in dev (no worker thread to drain on SIGINT).
// Structured JSON to stdout in prod.
export const logger =
  env.NODE_ENV === 'development'
    ? pino(
        { level: env.LOG_LEVEL, redact },
        pretty({ colorize: true, translateTime: 'HH:MM:ss.l', sync: true }),
      )
    : pino({ level: env.LOG_LEVEL, redact });
