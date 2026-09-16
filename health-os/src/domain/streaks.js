// "Never miss twice." The single behavioural rule the whole system defends.

import { addDays, daysBetween } from '../lib/time.js';
import { planForDay } from './program.js';

/**
 * Walk backwards from `date` and count consecutive TRAINING days with nothing
 * logged. Rest days do not break a streak and do not count as misses.
 *
 * `workoutsByDate`: Map<'YYYY-MM-DD', workoutRow[]>
 */
export function missStreak(date, profile, workoutsByDate, lookback = 21) {
  let misses = 0;
  const missed = [];
  for (let i = 0; i < lookback; i++) {
    const d = addDays(date, -i);
    if (daysBetween(profile.training.block.start_date, d) < 0) break;
    const plan = planForDay(d, profile);
    if (!plan.isTrainingDay) continue;
    const done = (workoutsByDate.get(d) ?? []).some((w) => w.completed);
    if (done) break;
    misses += 1;
    missed.push(d);
  }
  return { misses, missed, atRisk: misses === 1, broken: misses >= 2 };
}

/** Consecutive training days completed, walking back from `date`. */
export function hitStreak(date, profile, workoutsByDate, lookback = 60) {
  let hits = 0;
  for (let i = 0; i < lookback; i++) {
    const d = addDays(date, -i);
    if (daysBetween(profile.training.block.start_date, d) < 0) break;
    const plan = planForDay(d, profile);
    if (!plan.isTrainingDay) continue;
    const done = (workoutsByDate.get(d) ?? []).some((w) => w.completed);
    if (!done) break;
    hits += 1;
  }
  return hits;
}

/** Consecutive days with zero aerobic minutes. Two in a row escalates the nudge. */
export function zeroAerobicRun(date, workoutsByDate, lookback = 14) {
  let run = 0;
  for (let i = 0; i < lookback; i++) {
    const d = addDays(date, -i);
    const mins = (workoutsByDate.get(d) ?? [])
      .reduce((a, w) => a + (Number(w.zone2_minutes) || 0), 0);
    if (mins > 0) break;
    run += 1;
  }
  return run;
}

/** Days smoke-free since the quit date, or null before it. */
export function smokeFreeDays(date, profile, smokingByDate) {
  const quit = profile.smoking?.quit_date;
  if (!quit) return null;
  const since = daysBetween(quit, date);
  if (since < 0) return { beforeQuit: true, daysToQuit: -since, days: null, clean: null };
  let clean = 0;
  for (let i = 0; i <= since; i++) {
    const d = addDays(quit, i);
    const rows = smokingByDate.get(d) ?? [];
    const smoked = rows.some((r) => Number(r.cigarettes) > 0);
    if (smoked) clean = 0; else clean += 1;
  }
  return { beforeQuit: false, days: since + 1, clean, daysToQuit: 0 };
}
