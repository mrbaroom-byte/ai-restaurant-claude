import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProfile } from '../src/profile.js';
import { planForDay, blockWeek, recoveryBand, weeklyAerobicTarget } from '../src/domain/program.js';

const profile = loadProfile(process.env.TEST_PROFILE ?? './config/profile.example.json');
const START = profile.training.block.start_date;

test('a block starts on a Monday - the weekly template is keyed on ISO weekday', () => {
  const [y, m, day] = START.split('-').map(Number);
  assert.equal(new Date(Date.UTC(y, m - 1, day)).getUTCDay(), 1, `${START} is not a Monday`);
});

const d = (n) => {
  const [y, m, day] = START.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day + n)).toISOString().slice(0, 10);
};

test('the block runs four weeks from its start date', () => {
  assert.equal(blockWeek(d(0), profile.training.block), 1);
  assert.equal(blockWeek(d(6), profile.training.block), 1);
  assert.equal(blockWeek(d(7), profile.training.block), 2);
  assert.equal(blockWeek(d(27), profile.training.block), 4);
  assert.equal(blockWeek(d(-1), profile.training.block), 0);
});

test('the weekly template puts strength on Monday and Wednesday and rest on Sunday', () => {
  assert.equal(planForDay(d(0), profile).strengthLabel, 'A');
  assert.equal(planForDay(d(2), profile).strengthLabel, 'B');
  assert.equal(planForDay(d(1), profile).strengthLabel, null);
  assert.equal(planForDay(d(6), profile).isTrainingDay, false);
});

test('zone 2 is prescribed in the calibrated band, never the wearable Zone 2 band', () => {
  const z = planForDay(d(0), profile).zone2;
  assert.equal(z.hrLow, 110);
  assert.equal(z.hrHigh, 125);
  assert.ok(z.hrHigh < 138, 'must stay below the WHOOP Zone 2 floor of 138');
});

test('recovery bands map to the overlay thresholds', () => {
  const o = profile.training.recovery_overlay;
  assert.equal(recoveryBand(80, o), 'green');
  assert.equal(recoveryBand(67, o), 'green');
  assert.equal(recoveryBand(66, o), 'yellow');
  assert.equal(recoveryBand(34, o), 'yellow');
  assert.equal(recoveryBand(33, o), 'red');
  assert.equal(recoveryBand(null, o), null);
});

test('a red day cancels lifting and defers the session by one day', () => {
  const plan = planForDay(d(0), profile, { recoveryPct: 20 });
  assert.equal(plan.readiness, 'pull_back');
  assert.equal(plan.adjusted.isLiftDay, false);
  assert.equal(plan.adjusted.strengthDeferred, 'A');
  assert.equal(plan.adjusted.zone2, null);
  assert.equal(plan.adjusted.walkMinutes, 20);
});

test('yellow plus under six hours of sleep is treated as red', () => {
  const plan = planForDay(d(0), profile, { recoveryPct: 50, sleepHours: 5.5 });
  assert.equal(plan.recovery.band, 'yellow');
  assert.equal(plan.recovery.effectiveBand, 'red');
  assert.equal(plan.recovery.sleepDowngrade, true);
  assert.equal(plan.adjusted.isLiftDay, false);
});

test('yellow is the normal day: train, hold the load', () => {
  const plan = planForDay(d(0), profile, { recoveryPct: 50, sleepHours: 7.5 });
  assert.equal(plan.readiness, 'maintain');
  assert.equal(plan.adjusted.isLiftDay, true);
  assert.match(plan.adjusted.sets, /مجموعت|Two sets|Hold/i);
});

test('green allows the extra set and stretches zone 2 to thirty minutes', () => {
  const plan = planForDay(d(0), profile, { recoveryPct: 75, sleepHours: 8 });
  assert.equal(plan.readiness, 'push');
  assert.equal(plan.adjusted.zone2.maxMinutes, 30);
});

test('week four reaches the aerobic volume the block was built for', () => {
  assert.ok(weeklyAerobicTarget(4, profile) >= 125);
});
