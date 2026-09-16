// WHOOP payloads -> our rows. Pure: no network, no database, fully testable.
//
// Two ideas run through this file.
//
// 1. Zone 2 is ours, not WHOOP's. His true aerobic band is 110-125 bpm, which
//    falls inside WHOOP's default "Zone 1". If he has retuned the zones in the
//    WHOOP app so its Zone 2 matches his band, the per-sample `zone_two_milli`
//    is the best number available and we use it. If he has not, we say so
//    rather than quietly importing a number that means something else.
//
// 2. The optical sensor measures rate, not rhythm: a loose strap or an arm bent
//    under bodyweight produces readings that look like data. Every imported
//    value goes through a plausibility gate, the same way lab values do. A
//    suspect value is reported, never stored.

import { localDate } from '../../lib/time.js';

const MS_PER_MIN = 60_000;

/* ------------------------------------------------------------ plausibility --- */

export const PLAUSIBLE = {
  recovery_pct: [0, 100],
  resting_hr: [30, 110],
  sleep_hours: [0, 16],
  avg_hr: [30, 220],
  max_hr: [40, 230],
  hrv_ms: [1, 300],
  duration_min: [1, 600],
};

export function gate(field, value) {
  if (value == null || !Number.isFinite(Number(value))) return { ok: false, value: null, reason: null };
  const range = PLAUSIBLE[field];
  if (!range) return { ok: true, value: Number(value), reason: null };
  const [lo, hi] = range;
  const n = Number(value);
  if (n < lo || n > hi) {
    return {
      ok: false,
      value: null,
      reason: `${field} of ${n} is outside the plausible range (${lo}-${hi}) - likely a bad optical trace.`,
    };
  }
  return { ok: true, value: n, reason: null };
}

/* ------------------------------------------------------------------- sport --- */

const SPORT_TYPE = [
  [/weightlift|strength|powerlift|functional fitness|crossfit/i, 'strength'],
  [/^walk|walking|hik|ruck/i, 'walk'],
  [/elliptical|cycl|spin|row|run|jog|swim|stair|climb|tread|cardio/i, 'zone2'],
];

/** WHOOP sport name -> our workout type. Unknown sports are 'other'. */
export function workoutType(sportName) {
  const name = String(sportName ?? '');
  for (const [re, type] of SPORT_TYPE) if (re.test(name)) return type;
  return 'other';
}

/* ------------------------------------------------------------------ zone 2 --- */

const ZONE_FIELD = ['zone_zero_milli', 'zone_one_milli', 'zone_two_milli',
                    'zone_three_milli', 'zone_four_milli', 'zone_five_milli'];

/**
 * Minutes that actually count toward the aerobic total.
 *
 * Returns { minutes, method, suspect, reason }. `method` says how the number
 * was arrived at, so a trend chart can be read honestly:
 *   whoop_zones   - his WHOOP zones are calibrated to his band; per-sample truth
 *   avg_hr        - not calibrated; the whole session counted because its
 *                   average sat inside the band
 *   avg_hr_outside- not calibrated and the average sat outside the band
 *   unscored      - WHOOP has not scored the activity yet
 *   no_hr         - no usable heart-rate data
 */
export function deriveZone2(workout, profile) {
  const z = profile.training?.zone2 ?? {};
  const lo = z.hr_low ?? 110;
  const hi = z.hr_high ?? 125;
  const cfg = z.whoop_zone ?? {};
  const score = workout?.score ?? null;

  if (workout?.score_state !== 'SCORED' || !score) {
    return { minutes: null, method: 'unscored', suspect: false, reason: null };
  }

  const durationMin = durationMinutes(workout);
  const avgCheck = gate('avg_hr', score.average_heart_rate);
  const avg = avgCheck.ok ? avgCheck.value : null;

  if (cfg.calibrated === true) {
    const field = ZONE_FIELD[Number.isInteger(cfg.index) ? cfg.index : 2];
    const ms = score.zone_durations?.[field];
    if (ms != null && Number.isFinite(Number(ms))) {
      const minutes = Math.round(Number(ms) / MS_PER_MIN);
      // The cross-check that matters: if the app's zones were changed back, or
      // never actually saved, `zone_two_milli` starts meaning WHOOP's band
      // again. A long stretch "in zone" with an average far outside it is the
      // tell. Better to flag it than to silently log the wrong band.
      const farAbove = avg != null && avg > hi + 15;
      const farBelow = avg != null && avg < lo - 20;
      if (minutes >= 5 && (farAbove || farBelow)) {
        return {
          minutes: null,
          method: 'whoop_zones',
          suspect: true,
          reason: `WHOOP reports ${minutes} min in zone ${cfg.index ?? 2} but the session averaged `
            + `${avg} bpm, outside ${lo}-${hi}. The zones in the WHOOP app may no longer match.`,
        };
      }
      return { minutes, method: 'whoop_zones', suspect: false, reason: null };
    }
  }

  if (avg == null) return { minutes: null, method: 'no_hr', suspect: false, reason: avgCheck.reason };

  if (avg >= lo && avg <= hi) {
    return {
      minutes: durationMin,
      method: 'avg_hr',
      suspect: false,
      reason: cfg.calibrated === true ? null
        : `Counted from the session average (${avg} bpm). Calibrate the WHOOP zones to ${lo}-${hi} for per-minute accuracy.`,
    };
  }

  return {
    minutes: 0,
    method: 'avg_hr_outside',
    suspect: false,
    reason: `Session averaged ${avg} bpm, outside ${lo}-${hi}, so none of it counts as zone 2.`,
  };
}

function durationMinutes(w) {
  if (!w?.start || !w?.end) return null;
  const ms = new Date(w.end).getTime() - new Date(w.start).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.round(ms / MS_PER_MIN);
}

/**
 * Overlay a stored zone-calibration setting onto the profile.
 *
 * The profile carries the default; `/whoop zones ok` flips it at runtime
 * without anyone editing a file on a deployed host.
 */
export function withZoneConfig(profile, override) {
  if (!override) return profile;
  return {
    ...profile,
    training: {
      ...profile.training,
      zone2: { ...(profile.training?.zone2 ?? {}), whoop_zone: { ...(profile.training?.zone2?.whoop_zone ?? {}), ...override } },
    },
  };
}

/* ---------------------------------------------------------------- mappers --- */

/** WHOOP workout -> a `workouts` row, plus any warnings worth surfacing. */
export function mapWorkout(w, profile, timezone) {
  const warnings = [];
  const score = w?.score ?? null;
  const duration = durationMinutes(w);
  const durCheck = gate('duration_min', duration);
  if (duration != null && !durCheck.ok) warnings.push(durCheck.reason);

  const zone = deriveZone2(w, profile);
  if (zone.reason) warnings.push(zone.reason);

  const avg = gate('avg_hr', score?.average_heart_rate);
  const max = gate('max_hr', score?.max_heart_rate);
  if (avg.reason) warnings.push(avg.reason);
  if (max.reason) warnings.push(max.reason);

  return {
    row: {
      date: localDate(new Date(w.start), timezone),
      logged_at: w.start,
      type: workoutType(w.sport_name),
      duration_min: durCheck.ok ? durCheck.value : null,
      avg_hr: avg.value,
      max_hr: max.value,
      zone2_minutes: zone.minutes,
      completed: true,
      notes: w.sport_name ?? null,
      source: 'whoop',
      external_id: String(w.id),
      raw: w,
    },
    zoneMethod: zone.method,
    suspect: zone.suspect || warnings.length > 0,
    warnings,
  };
}

/**
 * A recovery plus the sleep it belongs to -> the morning row.
 *
 * The local date comes from when the sleep ENDED, which is the morning he woke
 * up, not when the sleep started - a sleep beginning at 23:40 belongs to the
 * next day's brief.
 */
export function mapRecovery(recovery, sleep, profile, timezone) {
  const warnings = [];
  const fields = {};

  if (recovery?.score_state === 'SCORED' && recovery.score) {
    const rec = gate('recovery_pct', recovery.score.recovery_score);
    const rhr = gate('resting_hr', recovery.score.resting_heart_rate);
    if (rec.ok) fields.recovery_pct = Math.round(rec.value); else if (rec.reason) warnings.push(rec.reason);
    if (rhr.ok) fields.resting_hr = Math.round(rhr.value); else if (rhr.reason) warnings.push(rhr.reason);
    if (recovery.score.user_calibrating) {
      warnings.push('WHOOP is still calibrating - the recovery score is not yet reliable.');
    }
  }

  const hours = sleepHours(sleep);
  if (hours != null) {
    const g = gate('sleep_hours', hours);
    if (g.ok) fields.sleep_hours = Math.round(g.value * 100) / 100;
    else if (g.reason) warnings.push(g.reason);
  }

  const anchor = sleep?.end ?? recovery?.created_at ?? null;
  return {
    date: anchor ? localDate(new Date(anchor), timezone) : null,
    fields,
    warnings,
    empty: Object.keys(fields).length === 0,
  };
}

/**
 * Actual sleep, not time in bed. A nap returns null - it must not overwrite the
 * night, and the brief is about the night.
 */
export function sleepHours(sleep) {
  if (!sleep || sleep.nap === true) return null;
  if (sleep.score_state !== 'SCORED' || !sleep.score?.stage_summary) return null;
  const s = sleep.score.stage_summary;
  const inBed = Number(s.total_in_bed_time_milli) || 0;
  const awake = Number(s.total_awake_time_milli) || 0;
  const noData = Number(s.total_no_data_time_milli) || 0;
  const asleep = inBed - awake - noData;
  if (!Number.isFinite(asleep) || asleep <= 0) return null;
  return asleep / 3_600_000;
}

/** A one-line human summary of an import, for the Telegram ack. */
export function describeImport({ recoveries = 0, sleeps = 0, workouts = 0, warnings = [] }) {
  const bits = [];
  if (recoveries) bits.push(`${recoveries} recovery`);
  if (sleeps) bits.push(`${sleeps} sleep`);
  if (workouts) bits.push(`${workouts} workout`);
  return { counts: bits, warnings };
}
