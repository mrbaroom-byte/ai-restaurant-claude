// A one-minute tick inside the web service, rather than an external cron.
//
// The service has to be online anyway for the Telegram webhook, and a tick
// that reads the user's local clock handles per-user timezones and a
// configurable schedule without redeploying a crontab. `job_runs` has a unique
// index on (user, job, local date), so a restart, a duplicated replica or a
// clock skew can never send the same brief twice.

import { localParts, minutesOfDay } from '../lib/time.js';
import { timezoneOf } from '../profile.js';
import { buildContext } from '../coach/context.js';
import * as repo from '../repo/index.js';
import { JOBS, runTriggers } from './jobs.js';
import * as tg from '../channels/telegram.js';

const TICK_MS = 60_000;
// How late a job may still fire after its slot - covers a restart or a deploy
// that spanned the exact minute. Beyond this the moment has passed.
const GRACE_MINUTES = 45;
// Event triggers are evaluated on this cadence rather than every tick.
const TRIGGER_EVERY_MINUTES = 15;

let timer = null;

export function startScheduler({ userId, profile }) {
  if (timer) return timer;
  console.log('[scheduler] started; ticking every 60s');
  const run = () => tick({ userId, profile }).catch((e) => console.error('[scheduler]', e));
  run();
  timer = setInterval(run, TICK_MS);
  return timer;
}

export function stopScheduler() {
  if (timer) { clearInterval(timer); timer = null; }
}

export async function tick({ userId, profile, at = new Date() }) {
  const tz = timezoneOf(profile);
  const parts = localParts(at, tz);
  const nowMin = minutesOfDay(parts.hhmm);
  const date = parts.date;
  const fired = [];

  for (const job of JOBS) {
    const slot = job.at(profile);
    if (!slot) continue;
    if (job.weekday && job.weekday(profile) !== parts.weekday) continue;

    const due = minutesOfDay(slot);
    const delay = nowMin - due;
    if (delay < 0 || delay > GRACE_MINUTES) continue;

    if (!(await repo.jobRuns.claim(userId, job.key, date))) continue;

    try {
      const skipped = await job.run(userId, profile, date);
      await repo.jobRuns.finish(userId, job.key, date, skipped ? 'skipped' : 'ok', skipped ?? null);
      fired.push({ job: job.key, skipped: skipped ?? false });
    } catch (e) {
      console.error(`[scheduler] ${job.key} failed:`, e.message);
      await repo.jobRuns.finish(userId, job.key, date, 'error', e.message);
      // Tell him the system broke rather than going quiet - silence is the
      // failure mode this project exists to prevent.
      await tg.sendMessage(`⚠️ ${job.key} ما اشتغل: ${e.message}`).catch(() => {});
      fired.push({ job: job.key, error: e.message });
    }
  }

  // Event triggers need the full context, which is ~10 queries. They are
  // day-scoped and claim once, so a quarter-hourly check is as responsive as a
  // per-minute one at a sixteenth of the database traffic.
  if (parts.minute % TRIGGER_EVERY_MINUTES !== 0) return { date, time: parts.hhmm, fired };
  try {
    const ctx = await buildContext(userId, profile, { at, date });
    const claim = (key) => repo.jobRuns.claim(userId, key, date);
    const t = await runTriggers(userId, profile, ctx, claim);
    for (const key of t) fired.push({ trigger: key });
  } catch (e) {
    console.error('[scheduler] triggers failed:', e.message);
  }

  return { date, time: parts.hhmm, fired };
}
