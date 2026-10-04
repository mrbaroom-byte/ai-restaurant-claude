// The training block: what today's session is, and how recovery changes it.

import { daysBetween, weekdayOf } from '../lib/time.js';

export const RECOVERY_BANDS = ['red', 'yellow', 'green'];

/** WHOOP recovery percentage -> band, using the profile's thresholds. */
export function recoveryBand(recoveryPct, overlay) {
  if (recoveryPct == null) return null;
  if (recoveryPct >= (overlay?.green?.min ?? 67)) return 'green';
  if (recoveryPct >= (overlay?.yellow?.min ?? 34)) return 'yellow';
  return 'red';
}

/**
 * Which week of the block `date` falls in.
 * Returns 0 before the block starts and null once it has ended.
 */
export function blockWeek(date, block) {
  const offset = daysBetween(block.start_date, date);
  if (offset < 0) return 0;
  if (block.end_date && daysBetween(date, block.end_date) < 0) return null;
  return Math.floor(offset / 7) + 1;
}

function progressionFor(week, progression) {
  if (!week) return null;
  return progression.find((p) => p.week === week) ?? progression[progression.length - 1] ?? null;
}

const SESSION_LABELS = {
  zone2: 'Zone 2',
  strength_a: 'Strength A',
  strength_b: 'Strength B',
  walk_long: 'Long easy walk',
  rest: 'Rest, mobility, weekly review',
};

/**
 * The plan for one day, before and after the recovery overlay.
 *
 * Shape:
 *   { date, weekday, week, planned: [...], zone2, strength, steps,
 *     recovery: { pct, band, action }, adjusted: {...}, readiness }
 */
export function planForDay(date, profile, { recoveryPct = null, sleepHours = null } = {}) {
  const t = profile.training;
  const week = blockWeek(date, t.block);
  const weekday = weekdayOf(date);
  const planned = (t.weekly_template?.[String(weekday)] ?? []).slice();
  const prog = progressionFor(week, t.progression || []);

  const strengthKey = planned.includes('strength_a') ? 'A' : planned.includes('strength_b') ? 'B' : null;
  const base = {
    date,
    weekday,
    week,
    inBlock: week !== null && week > 0,
    planned,
    plannedLabels: planned.map((p) => SESSION_LABELS[p] ?? p),
    isTrainingDay: planned.some((p) => p !== 'rest'),
    isLiftDay: Boolean(strengthKey),
    strengthLabel: strengthKey,
    strengthExercises: strengthKey ? (t.strength?.[strengthKey] ?? []) : [],
    strengthPrescription: t.strength?.prescription ?? null,
    zone2: planned.includes('zone2')
      ? {
          minutes: prog?.zone2_min ?? 20,
          maxMinutes: prog?.zone2_max ?? null,
          hrLow: t.zone2?.hr_low ?? 110,
          hrHigh: t.zone2?.hr_high ?? 125,
        }
      : null,
    walkLong: planned.includes('walk_long'),
    stepsTarget: prog?.steps ?? null,
    rpe: prog?.rpe ?? null,
    strengthNote: prog?.strength ?? null,
  };

  const band = recoveryBand(recoveryPct, t.recovery_overlay);
  const overlay = band ? t.recovery_overlay?.[band] : null;

  // Sleep under 6 h drags a yellow day down to a red one - the spec's event trigger.
  const sleepDowngrade = band === 'yellow' && sleepHours != null && sleepHours < 6;
  const effectiveBand = sleepDowngrade ? 'red' : band;
  const effectiveOverlay = effectiveBand ? t.recovery_overlay?.[effectiveBand] : null;

  const adjusted = applyOverlay(base, effectiveBand, t);

  return {
    ...base,
    recovery: {
      pct: recoveryPct,
      band,
      effectiveBand,
      sleepHours,
      sleepDowngrade,
      action: effectiveOverlay?.action ?? overlay?.action ?? null,
    },
    adjusted,
    readiness: readinessCall(effectiveBand, base),
  };
}

function applyOverlay(base, band, t) {
  if (!band || !base.isTrainingDay) return { ...base, changed: false };
  if (band === 'green') {
    return {
      ...base,
      changed: true,
      sets: 'Two sets, plus a third on the first lift if it feels clean.',
      zone2: base.zone2 ? { ...base.zone2, maxMinutes: Math.max(base.zone2.maxMinutes ?? 0, 30) } : null,
    };
  }
  if (band === 'yellow') {
    return { ...base, changed: true, sets: 'Two sets. Hold the load.' };
  }
  // red
  return {
    ...base,
    changed: true,
    isLiftDay: false,
    strengthExercises: [],
    strengthDeferred: base.strengthLabel,
    sets: null,
    zone2: null,
    walkLong: true,
    walkMinutes: 20,
    note: t.recovery_overlay?.red?.action ?? 'No lifting. 20 min easy walk. Shift strength forward one day.',
  };
}

/** push | maintain | pull_back - the one-word call the morning brief leads with. */
export function readinessCall(band, base) {
  if (!base.isTrainingDay) return 'rest';
  if (band === 'green') return 'push';
  if (band === 'red') return 'pull_back';
  return 'maintain'; // yellow, or unknown recovery
}

/** Zone-2 minutes the whole week asks for, used by the weekly review. */
export function weeklyAerobicTarget(week, profile) {
  const prog = progressionFor(week, profile.training?.progression || []);
  if (!prog) return null;
  return (prog.zone2_min ?? 0) * (prog.sessions ?? 5);
}
