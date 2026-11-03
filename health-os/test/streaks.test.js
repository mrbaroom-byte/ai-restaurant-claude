import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProfile } from '../src/profile.js';
import { missStreak, hitStreak, zeroAerobicRun, smokeFreeDays } from '../src/domain/streaks.js';
import { addDays } from '../src/lib/time.js';

const profile = loadProfile(process.env.TEST_PROFILE ?? './config/profile.example.json');
const START = profile.training.block.start_date;
const d = (n) => addDays(START, n);
const map = (entries) => new Map(entries);

test('a rest day does not count as a miss', () => {
  // d(5) is Saturday (long walk), d(6) is Sunday (rest).
  const s = missStreak(d(6), profile, map([[d(5), [{ completed: true }]]]));
  assert.equal(s.misses, 0);
});

test('one missed training day is "at risk", two is a broken rule', () => {
  const trained = map([[d(0), [{ completed: true }]]]);
  assert.equal(missStreak(d(1), profile, trained).atRisk, true);
  assert.equal(missStreak(d(1), profile, trained).broken, false);
  assert.equal(missStreak(d(2), profile, trained).broken, true);
  assert.equal(missStreak(d(2), profile, trained).misses, 2);
});

test('the streak never looks back before the block started', () => {
  assert.equal(missStreak(d(0), profile, map([])).misses, 1);
  assert.ok(missStreak(d(0), profile, map([])).missed.every((x) => x >= START));
});

test('completed training days accumulate a hit streak', () => {
  const trained = map([[d(0), [{ completed: true }]], [d(1), [{ completed: true }]], [d(2), [{ completed: true }]]]);
  assert.equal(hitStreak(d(2), profile, trained), 3);
  assert.equal(hitStreak(d(1), profile, trained), 2);
});

test('an incomplete row does not count as trained', () => {
  const skipped = map([[d(0), [{ completed: false, skipped_reason: 'travel' }]]]);
  assert.equal(hitStreak(d(0), profile, skipped), 0);
  assert.equal(missStreak(d(0), profile, skipped).misses, 1);
});

test('zero-aerobic days accumulate and reset on any aerobic minute', () => {
  assert.equal(zeroAerobicRun(d(3), map([]), 5), 5);
  assert.equal(zeroAerobicRun(d(3), map([[d(3), [{ zone2_minutes: 20 }]]]), 5), 0);
  assert.equal(zeroAerobicRun(d(3), map([[d(2), [{ zone2_minutes: 20 }]]]), 5), 1);
});

test('the smoke-free counter runs from the quit date', () => {
  const quit = profile.smoking.quit_date;
  const before = smokeFreeDays(addDays(quit, -3), profile, new Map());
  assert.equal(before.beforeQuit, true);
  assert.equal(before.daysToQuit, 3);

  const after = smokeFreeDays(addDays(quit, 9), profile, new Map());
  assert.equal(after.beforeQuit, false);
  assert.equal(after.days, 10);
  assert.equal(after.clean, 10);
});

test('a smoked day resets the clean count but not the days elapsed', () => {
  const quit = profile.smoking.quit_date;
  const relapse = new Map([[addDays(quit, 5), [{ cigarettes: 2 }]]]);
  const s = smokeFreeDays(addDays(quit, 9), profile, relapse);
  assert.equal(s.days, 10);
  assert.equal(s.clean, 4);
});
