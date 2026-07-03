import Bottleneck from 'bottleneck';
import pRetry, { AbortError } from 'p-retry';
import { logger } from '../util/logger.js';

const LIMITERS = new Map<string, Bottleneck>();

function limiterFor(userId: string): Bottleneck {
  let l = LIMITERS.get(userId);
  if (!l) {
    l = new Bottleneck({
      maxConcurrent: 10,
      minTime: 40, // ~25 rps burst ceiling (well under Drive's 1000/100s user cap)
      reservoir: 900,
      reservoirRefreshAmount: 900,
      reservoirRefreshInterval: 100_000, // matches Drive's own quota window
    });
    LIMITERS.set(userId, l);
  }
  return l;
}

// Reason strings inside a 403 that indicate a permanent config problem, not a
// transient rate limit — fail fast instead of burning the retry budget.
const NON_RETRYABLE_403_REASONS = [
  'accessNotConfigured',
  'forbidden',
  'dailyLimitExceededUnreg',
  'insufficientPermissions',
  'appNotAuthorizedToFile',
  'domainPolicy',
];

function is403Retryable(err: unknown): boolean {
  const anyErr = err as {
    errors?: Array<{ reason?: string }>;
    response?: { data?: { error?: { errors?: Array<{ reason?: string }>; status?: string } } };
  };
  const reasons: string[] = [
    ...(anyErr.errors?.map((e) => e.reason ?? '') ?? []),
    ...(anyErr.response?.data?.error?.errors?.map((e) => e.reason ?? '') ?? []),
  ];
  if (reasons.some((r) => NON_RETRYABLE_403_REASONS.includes(r))) return false;
  return true; // rateLimitExceeded / userRateLimitExceeded → retry
}

export async function withDriveLimit<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const l = limiterFor(userId);
  return l.schedule(() =>
    pRetry(
      async () => {
        try {
          return await fn();
        } catch (err: unknown) {
          const code = (err as { code?: number }).code;
          const status = (err as { response?: { status?: number } }).response?.status;
          const httpStatus = status ?? code;
          if (httpStatus === 429) throw err;
          if (httpStatus === 403 && is403Retryable(err)) throw err;
          if (typeof httpStatus === 'number' && httpStatus >= 500) throw err;
          throw new AbortError(err as Error);
        }
      },
      {
        retries: 5,
        minTimeout: 400,
        factor: 2,
        randomize: true,
        onFailedAttempt: (e) =>
          logger.warn({ err: e.message, attempt: e.attemptNumber }, 'drive retry'),
      },
    ),
  );
}
