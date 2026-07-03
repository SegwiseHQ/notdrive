import { archivePurgeTick } from './archivePurge.js';
import { drivePollTick } from './drivePoll.js';
import { inviteGcTick } from './inviteGc.js';
import { sessionGcTick } from './sessionGc.js';

const jobs = {
  'drive-poll': drivePollTick,
  'archive-purge': archivePurgeTick,
  'session-gc': sessionGcTick,
  'invite-gc': inviteGcTick,
} as const;

async function main() {
  const name = process.argv[2] as keyof typeof jobs | undefined;
  if (!name || !(name in jobs)) {
    console.error(`usage: jobs:run <${Object.keys(jobs).join('|')}>`);
    process.exit(2);
  }
  const out = await jobs[name]();
  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
