import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../src/bot/parse.js';

test('morning metrics parse in any order', () => {
  assert.deepEqual(P.parseDailyMetrics('recovery 55 sleep 7.2 rhr 72 steps 4200'),
    { recovery_pct: 55, sleep_hours: 7.2, resting_hr: 72, steps: 4200 });
  assert.deepEqual(P.parseDailyMetrics('sleep 6,8 weight 80.4'),
    { sleep_hours: 6.8, weight_kg: 80.4 });
  assert.equal(P.parseDailyMetrics('nothing numeric here'), null);
});

test('a bare hr in a workout line is the session average, never resting HR', () => {
  // "z2 20 hr 118" must not overwrite the morning resting-HR reading.
  assert.equal(P.parseDailyMetrics('z2 20 hr 118 rpe 6'), null);
  assert.equal(P.parseWorkout('z2 20 hr 118 rpe 6').avg_hr, 118);
});

test('workout duration is not confused with RPE or heart rate', () => {
  assert.equal(P.parseWorkout('z2 22').duration_min, 22);
  assert.equal(P.parseWorkout('strength A rpe 7').duration_min, null);
  assert.equal(P.parseWorkout('strength A rpe 7').session_label, 'A');
  assert.equal(P.parseWorkout('walk 35 hr 118').duration_min, 35);
  assert.equal(P.parseWorkout('z2 20 rpe 6 hr 120 maxhr 131').duration_min, 20);
  assert.equal(P.parseWorkout('z2 20 rpe 6 hr 120 maxhr 131').max_hr, 131);
});

test('only aerobic work counts toward the aerobic total', () => {
  assert.equal(P.parseWorkout('z2 25').zone2_minutes, 25);
  assert.equal(P.parseWorkout('strength B 45 min').zone2_minutes, null);
});

test('a skipped session is recorded, not ignored', () => {
  const w = P.parseWorkout('skipped travel');
  assert.equal(w.completed, false);
  assert.equal(w.skipped_reason, 'travel');
});

test('prose is not mistaken for a workout', () => {
  assert.equal(P.parseWorkout('felt tired today'), null);
});

test('weight accepts a bare number in a plausible range only', () => {
  assert.equal(P.parseWeight('81.4 kg'), 81.4);
  assert.equal(P.parseWeight('81,4'), 81.4);
  assert.equal(P.parseWeight('5'), null);
  assert.equal(P.parseWeight('z2 22'), null);
});

test('lab entry converts and flags', () => {
  const ok = P.parseLabs('2026-03-04 ldl 4.1 mmol/L, hdl 1.3 mmol/L', '2026-03-07');
  assert.equal(ok.drawn_on, '2026-03-04');
  assert.equal(ok.results.length, 2);
  assert.equal(ok.problems.length, 0);
  assert.equal(Math.round(ok.results[0].value_mgdl), 159);

  const bad = P.parseLabs('total cholesterol 5 mg/dL', '2026-03-07');
  assert.equal(bad.results[0].suspect, true);
  assert.equal(bad.problems.length, 1);
});

test('lab entry defaults the date to today', () => {
  assert.equal(P.parseLabs('ldl 3.1 mmol/L', '2026-03-07').drawn_on, '2026-03-07');
});

test('scan and smoking entries parse', () => {
  const s = P.parseScan('2026-10-12 weight 78.5 fat 26 muscle 32.6 visceral 9', '2026-10-12');
  assert.equal(s.weight_kg, 78.5);
  assert.equal(s.skeletal_muscle_kg, 32.6);
  assert.equal(P.parseScan('nothing', '2026-10-12'), null);

  assert.equal(P.parseSmoking('smoked 3').cigarettes, 3);
  assert.equal(P.parseSmoking('clean').cigarettes, 0);
  assert.deepEqual(P.parseSmoking('craving 8 trigger coffee'),
    { cigarettes: null, craving_peak: 8, trigger: 'coffee' });
  assert.equal(P.parseSmoking('hello'), null);
});

test('commands split from their arguments', () => {
  assert.deepEqual(P.splitCommand('/meal grilled chicken'), { command: 'meal', args: 'grilled chicken' });
  assert.deepEqual(P.splitCommand('/day'), { command: 'day', args: '' });
  assert.deepEqual(P.splitCommand('just talking'), { command: null, args: 'just talking' });
});
