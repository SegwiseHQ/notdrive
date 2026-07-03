import { nanoid } from 'nanoid';
import { logger } from '../util/logger.js';
import { archivePurgeTick } from './archivePurge.js';
import { drivePollTick } from './drivePoll.js';
import { inviteGcTick } from './inviteGc.js';
import { tryAcquire } from './lease.js';
import { sessionGcTick } from './sessionGc.js';

interface Job {
  name: string;
  intervalMs: number;
  leaseTtlMs: number;
  run: () => Promise<unknown>;
}

const JOBS: Job[] = [
  { name: 'drive-poll', intervalMs: 60_000, leaseTtlMs: 90_000, run: drivePollTick },
  {
    name: 'archive-purge',
    intervalMs: 60 * 60 * 1000,
    leaseTtlMs: 5 * 60_000,
    run: archivePurgeTick,
  },
  { name: 'session-gc', intervalMs: 15 * 60 * 1000, leaseTtlMs: 5 * 60_000, run: sessionGcTick },
  { name: 'invite-gc', intervalMs: 60 * 60 * 1000, leaseTtlMs: 5 * 60_000, run: inviteGcTick },
];

export function startJobRunner() {
  const holder = nanoid(8);
  const lastRun = new Map<string, number>();

  const tick = async () => {
    const ts = Date.now();
    for (const j of JOBS) {
      if ((lastRun.get(j.name) ?? 0) + j.intervalMs > ts) continue;
      const ok = await tryAcquire(j.name, holder, j.leaseTtlMs);
      if (!ok) continue;
      lastRun.set(j.name, ts);
      try {
        const out = await j.run();
        logger.debug({ job: j.name, out }, 'job tick');
      } catch (err) {
        logger.error({ job: j.name, err: (err as Error).message }, 'job failed');
      }
    }
  };

  const handle = setInterval(() => {
    void tick();
  }, 10_000);
  // Run on startup too.
  void tick();
  logger.info({ holder }, 'job runner started');
  return () => clearInterval(handle);
}
