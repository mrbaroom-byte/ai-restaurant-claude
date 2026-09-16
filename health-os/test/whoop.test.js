import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadProfile } from '../src/profile.js';
import {
  workoutType, deriveZone2, gate, sleepHours, mapRecovery, mapWorkout, withZoneConfig,
} from '../src/integrations/whoop/map.js';
import { sign, verify, parseEvent, EVENT_TYPES } from '../src/integrations/whoop/webhook.js';
import { SCOPES, PAGE_LIMIT, API_BASE, AUTH_URL, TOKEN_URL } from '../src/integrations/whoop/api.js';

const PROFILE_PATH = process.env.TEST_PROFILE
  ?? (fs.existsSync('./config/profile.json') ? './config/profile.json' : './config/profile.example.json');
const base = loadProfile(PROFILE_PATH);
const TZ = base.user.timezone;
const LO = base.training.zone2.hr_low;
const HI = base.training.zone2.hr_high;

const calibrated = withZoneConfig(base, { calibrated: true, index: 2 });
const uncalibrated = withZoneConfig(base, { calibrated: false });

function workout({ startZ = '2026-09-15T05:00:00.000Z', minutes = 30, avg = 118, max = 130,
                   zoneTwoMin = 24, sport = 'Elliptical', state = 'SCORED', id = 'w-1' } = {}) {
  const end = new Date(new Date(startZ).getTime() + minutes * 60_000).toISOString();
  return {
    id, user_id: 1, start: startZ, end, timezone_offset: '+03:00', sport_name: sport,
    score_state: state,
    score: state === 'SCORED' ? {
      strain: 8.1, average_heart_rate: avg, max_heart_rate: max, kilojoule: 900,
      percent_recorded: 100, distance_meter: 0, altitude_gain_meter: 0, altitude_change_meter: 0,
      zone_durations: {
        zone_zero_milli: 60_000, zone_one_milli: 120_000,
        zone_two_milli: zoneTwoMin * 60_000,
        zone_three_milli: 0, zone_four_milli: 0, zone_five_milli: 0,
      },
    } : null,
  };
}

/* ------------------------------------------------------------- api shape --- */

test('the client targets the v2 surface with the scopes the spec defines', () => {
  assert.equal(API_BASE, 'https://api.prod.whoop.com/developer');
  assert.equal(AUTH_URL, 'https://api.prod.whoop.com/oauth/oauth2/auth');
  assert.equal(TOKEN_URL, 'https://api.prod.whoop.com/oauth/oauth2/token');
  // Without `offline` there is no refresh token and the link dies in an hour.
  assert.ok(SCOPES.includes('offline'));
  for (const s of ['read:recovery', 'read:cycles', 'read:sleep', 'read:workout']) {
    assert.ok(SCOPES.includes(s), `missing scope ${s}`);
  }
  // The spec caps limit at 25; asking for more is a 400.
  assert.ok(PAGE_LIMIT <= 25);
});

/* ---------------------------------------------------------------- sports --- */

test('sports map to our four workout types', () => {
  assert.equal(workoutType('Weightlifting'), 'strength');
  assert.equal(workoutType('Functional Fitness'), 'strength');
  assert.equal(workoutType('Walking'), 'walk');
  assert.equal(workoutType('Elliptical'), 'zone2');
  assert.equal(workoutType('Cycling'), 'zone2');
  assert.equal(workoutType('Padel'), 'other');
  assert.equal(workoutType(undefined), 'other');
});

/* ---------------------------------------------------------------- zone 2 --- */

test('calibrated zones are trusted per minute', () => {
  const z = deriveZone2(workout({ zoneTwoMin: 24, avg: 118 }), calibrated);
  assert.equal(z.method, 'whoop_zones');
  assert.equal(z.minutes, 24);
  assert.equal(z.suspect, false);
});

test('uncalibrated zones are never read as ours - the whole session counts, or none of it', () => {
  // WHOOP's own Zone 2 is 138-148 for him, which is not his band at all.
  const inBand = deriveZone2(workout({ avg: 118, minutes: 30, zoneTwoMin: 24 }), uncalibrated);
  assert.equal(inBand.method, 'avg_hr');
  assert.equal(inBand.minutes, 30, 'the session average sat inside the band');
  assert.match(inBand.reason, /Calibrate the WHOOP zones/);

  const tooHard = deriveZone2(workout({ avg: 155, minutes: 30, zoneTwoMin: 24 }), uncalibrated);
  assert.equal(tooHard.method, 'avg_hr_outside');
  assert.equal(tooHard.minutes, 0, 'a hard session earns no zone-2 credit');
});

test('a calibrated claim that contradicts the session average is refused, not stored', () => {
  // This is what it looks like when the zones were changed back in the app:
  // WHOOP still reports time "in zone 2", but at 155 bpm that is its band, not his.
  const z = deriveZone2(workout({ avg: 155, zoneTwoMin: 25 }), calibrated);
  assert.equal(z.suspect, true);
  assert.equal(z.minutes, null);
  assert.match(z.reason, /no longer match/);
});

test('a brief burst inside a hard session is not treated as a calibration failure', () => {
  const z = deriveZone2(workout({ avg: 150, zoneTwoMin: 3 }), calibrated);
  assert.equal(z.suspect, false, 'under five minutes is noise, not evidence');
});

test('unscored and heart-rate-less activities yield null, never zero', () => {
  assert.equal(deriveZone2(workout({ state: 'PENDING_SCORE' }), calibrated).method, 'unscored');
  assert.equal(deriveZone2(workout({ state: 'PENDING_SCORE' }), calibrated).minutes, null);
  const noHr = workout({ avg: null });
  noHr.score.zone_durations = null;
  assert.equal(deriveZone2(noHr, uncalibrated).method, 'no_hr');
});

test('the band used is the profile band, not a constant', () => {
  const shifted = withZoneConfig({
    ...base,
    training: { ...base.training, zone2: { ...base.training.zone2, hr_low: 140, hr_high: 150 } },
  }, { calibrated: false });
  assert.equal(deriveZone2(workout({ avg: 145 }), shifted).method, 'avg_hr');
  assert.equal(deriveZone2(workout({ avg: 118 }), shifted).method, 'avg_hr_outside');
});

/* ---------------------------------------------------- plausibility gating --- */

test('implausible optical readings are refused with a reason', () => {
  assert.equal(gate('resting_hr', 74).ok, true);
  const bad = gate('resting_hr', 190);
  assert.equal(bad.ok, false);
  assert.equal(bad.value, null);
  assert.match(bad.reason, /optical trace/);
  assert.equal(gate('recovery_pct', 140).ok, false);
  assert.equal(gate('sleep_hours', 25).ok, false);
  assert.equal(gate('resting_hr', null).ok, false);
});

/* ------------------------------------------------------------------ sleep --- */

test('sleep hours are time asleep, not time in bed', () => {
  const s = {
    nap: false, score_state: 'SCORED',
    score: { stage_summary: {
      total_in_bed_time_milli: 8 * 3_600_000,
      total_awake_time_milli: 30 * 60_000,
      total_no_data_time_milli: 0,
    } },
  };
  assert.equal(Math.round(sleepHours(s) * 100) / 100, 7.5);
});

test('a nap never overwrites the night', () => {
  assert.equal(sleepHours({ nap: true, score_state: 'SCORED', score: { stage_summary: { total_in_bed_time_milli: 3_600_000 } } }), null);
});

/* --------------------------------------------------------------- recovery --- */

const sleepRow = (endZ = '2026-09-15T03:10:00.000Z') => ({
  id: 's-1', cycle_id: 99, nap: false, score_state: 'SCORED',
  start: '2026-09-14T20:00:00.000Z', end: endZ,
  score: { stage_summary: {
    total_in_bed_time_milli: 7.5 * 3_600_000,
    total_awake_time_milli: 20 * 60_000,
    total_no_data_time_milli: 0,
  } },
});

const recoveryRow = (over = {}) => ({
  cycle_id: 99, sleep_id: 's-1', user_id: 1, score_state: 'SCORED',
  created_at: '2026-09-15T03:15:00.000Z',
  score: { user_calibrating: false, recovery_score: 67, resting_heart_rate: 72, hrv_rmssd_milli: 41, ...over },
});

test('the morning row is dated by when the sleep ended, not when it started', () => {
  // Asleep from 23:00 on the 14th, awake at 06:10 on the 15th: this is the
  // 15th's brief.
  const m = mapRecovery(recoveryRow(), sleepRow(), base, TZ);
  assert.equal(m.date, '2026-09-15');
  assert.equal(m.fields.recovery_pct, 67);
  assert.equal(m.fields.resting_hr, 72);
  assert.ok(m.fields.sleep_hours > 7 && m.fields.sleep_hours < 7.5);
});

test('a calibrating watch is flagged rather than trusted', () => {
  const m = mapRecovery(recoveryRow({ user_calibrating: true }), sleepRow(), base, TZ);
  assert.ok(m.warnings.some((w) => /calibrating/i.test(w)));
});

test('an impossible resting heart rate is dropped, and the rest of the row survives', () => {
  const m = mapRecovery(recoveryRow({ resting_heart_rate: 190 }), sleepRow(), base, TZ);
  assert.equal(m.fields.resting_hr, undefined);
  assert.equal(m.fields.recovery_pct, 67, 'one bad field does not discard the good ones');
  assert.ok(m.warnings.length > 0);
});

test('a sleep with no recovery yet still lands its hours', () => {
  const m = mapRecovery(null, sleepRow(), base, TZ);
  assert.equal(m.empty, false);
  assert.ok(m.fields.sleep_hours > 0);
  assert.equal(m.fields.recovery_pct, undefined);
});

/* --------------------------------------------------------------- workouts --- */

test('a workout maps to a row carrying its provenance', () => {
  const m = mapWorkout(workout({ sport: 'Elliptical' }), calibrated, TZ);
  assert.equal(m.row.source, 'whoop');
  assert.equal(m.row.external_id, 'w-1');
  assert.equal(m.row.type, 'zone2');
  assert.equal(m.row.duration_min, 30);
  assert.equal(m.row.zone2_minutes, 24);
  assert.equal(m.row.date, '2026-09-15');
  assert.equal(m.row.completed, true);
  assert.ok(m.row.raw, 'the original payload is kept so an import can be traced');
});

test('lifting earns no aerobic minutes even when the heart rate sits in the band', () => {
  const m = mapWorkout(workout({ sport: 'Weightlifting', avg: 118, zoneTwoMin: 0 }), calibrated, TZ);
  assert.equal(m.row.type, 'strength');
  assert.equal(m.row.zone2_minutes, 0);
});

/* --------------------------------------------------------------- webhooks --- */

test('a correctly signed delivery verifies', () => {
  const secret = 'test-secret';
  const body = JSON.stringify({ user_id: 1, id: 's-1', type: 'recovery.updated', trace_id: 't' });
  const ts = String(Date.now());
  const headers = { 'x-whoop-signature': sign(ts, body, secret), 'x-whoop-signature-timestamp': ts };
  assert.equal(verify(headers, body, { secret }).ok, true);
});

test('tampering, the wrong secret, a stale timestamp and missing headers all fail', () => {
  const secret = 'test-secret';
  const body = JSON.stringify({ id: 'x', type: 'sleep.updated' });
  const ts = String(Date.now());
  const sig = sign(ts, body, secret);
  const headers = { 'x-whoop-signature': sig, 'x-whoop-signature-timestamp': ts };

  assert.equal(verify(headers, `${body} `, { secret }).ok, false, 'body tampered');
  assert.equal(verify(headers, body, { secret: 'other' }).ok, false, 'wrong secret');
  assert.equal(verify({ ...headers, 'x-whoop-signature-timestamp': String(Date.now() - 3_600_000) }, body, { secret }).ok,
    false, 'stale timestamp');
  assert.equal(verify({}, body, { secret }).ok, false, 'no headers');
  assert.equal(verify({ ...headers, 'x-whoop-signature': 'short' }, body, { secret }).ok, false, 'length mismatch');
});

test('the signature is over the raw bytes, so a re-serialised body breaks it', () => {
  const secret = 'test-secret';
  // What a provider actually sends: whitespace, and whatever key order it likes.
  const raw = '{\n  "user_id": 1,\n  "id": "x",\n  "type": "sleep.updated"\n}';
  const ts = String(Date.now());
  const headers = { 'x-whoop-signature': sign(ts, raw, secret), 'x-whoop-signature-timestamp': ts };

  assert.equal(verify(headers, raw, { secret }).ok, true, 'the exact bytes verify');
  // Parse-then-stringify loses the whitespace and normalises the key order,
  // which is why the handler must be handed the raw body, not the parsed object.
  const reserialised = JSON.stringify(JSON.parse(raw));
  assert.notEqual(reserialised, raw);
  assert.equal(verify(headers, reserialised, { secret }).ok, false);
});

test('only the six documented event types are accepted', () => {
  assert.deepEqual(EVENT_TYPES.slice().sort(), [
    'recovery.deleted', 'recovery.updated',
    'sleep.deleted', 'sleep.updated',
    'workout.deleted', 'workout.updated',
  ]);
  for (const type of EVENT_TYPES) {
    assert.equal(parseEvent(JSON.stringify({ id: 'a', type, user_id: 1 })).ok, true, type);
  }
  assert.equal(parseEvent(JSON.stringify({ id: 'a', type: 'cycle.updated' })).ok, false);
  assert.equal(parseEvent(JSON.stringify({ type: 'sleep.updated' })).ok, false, 'no id');
  assert.equal(parseEvent('not json').ok, false);
});
