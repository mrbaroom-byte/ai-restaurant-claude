import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadProfile } from '../src/profile.js';
import { planForDay } from '../src/domain/program.js';
import {
  scoreDay, levelFor, XP_RULES, LEVELS, ACHIEVEMENTS,
  evaluateAchievements, scoreboard, buildHistory,
} from '../src/domain/gamification.js';
import { addDays } from '../src/lib/time.js';
import { STRINGS, LEVEL_NAMES, XP_NAMES, ACHIEVEMENT_NAMES, LANGS } from '../src/dashboard/i18n.js';

const PROFILE_PATH = process.env.TEST_PROFILE
  ?? (fs.existsSync('./config/profile.json') ? './config/profile.json' : './config/profile.example.json');
const profile = loadProfile(PROFILE_PATH);
const START = profile.training.block.start_date;      // a Monday: zone 2 + strength A
const d = (n) => addDays(START, n);

function day(date, opts) {
  return {
    date,
    plan: planForDay(date, profile, {
      recoveryPct: opts.recovery ?? null,
      sleepHours: opts.sleep ?? null,
    }),
    daily: opts.daily ?? null,
    meals: opts.meals ?? [],
    workouts: opts.workouts ?? [],
    supplementsDue: opts.supplementsDue,
    supplementsTaken: opts.supplementsTaken,
    smokeFree: opts.smokeFree ?? null,
  };
}
const keys = (s) => s.earned.map((e) => e.key).sort();

test('levels rise monotonically and report the distance to the next one', () => {
  for (let i = 1; i < LEVELS.length; i++) assert.ok(LEVELS[i].at > LEVELS[i - 1].at);
  assert.equal(levelFor(0).level, 1);
  assert.equal(levelFor(LEVELS[1].at).level, 2);
  assert.equal(levelFor(LEVELS[1].at - 1).level, 1);
  assert.equal(levelFor(LEVELS[1].at - 1).toNext, 1);
  const top = levelFor(999999);
  assert.equal(top.next, null);
  assert.equal(top.progress, 1);
});

test('a fully executed day earns the session, food, sleep and supplement points', () => {
  const s = scoreDay(day(d(0), {
    recovery: 75, sleep: 8, daily: { recovery_pct: 75, sleep_hours: 8 },
    meals: [{ protein_g_est: 55 }, { protein_g_est: 55 }, { protein_g_est: 55 }],
    workouts: [{ completed: true, type: 'strength' }],
    supplementsDue: 3, supplementsTaken: 3,
  }), profile);
  assert.deepEqual(keys(s), ['meals_logged', 'metrics_logged', 'protein_target', 'session_done', 'sleep_7h', 'supplements']);
});

test('lifting through a red day earns nothing for the session', () => {
  const s = scoreDay(day(d(0), {
    recovery: 20, daily: { recovery_pct: 20 },
    workouts: [{ completed: true, type: 'strength' }],
  }), profile);
  assert.deepEqual(keys(s), ['metrics_logged']);
  assert.ok(!keys(s).includes('session_done'));
  assert.ok(!keys(s).includes('rest_respected'));
});

test('backing off on a red day is rewarded - that is the hard discipline', () => {
  const s = scoreDay(day(d(0), {
    recovery: 20, daily: { recovery_pct: 20 },
    workouts: [{ completed: true, type: 'walk' }],
  }), profile);
  assert.ok(keys(s).includes('rest_respected'));
});

test('doing nothing at all on a red day still counts as respecting it', () => {
  const s = scoreDay(day(d(0), { recovery: 20, daily: { recovery_pct: 20 }, workouts: [] }), profile);
  assert.ok(keys(s).includes('rest_respected'));
});

test('nothing rewards eating less, and a zero day never goes negative', () => {
  const starved = scoreDay(day(d(0), {
    daily: { sleep_hours: 8 }, meals: [{ kcal_est: 300, protein_g_est: 10 }],
  }), profile);
  assert.ok(starved.xp >= 0);
  assert.ok(!keys(starved).includes('protein_target'));
  // No rule anywhere pays for a deficit, a weight drop, or a skipped meal.
  const names = XP_RULES.map((r) => r.key).join(' ');
  assert.doesNotMatch(names, /deficit|weight|fast|skip/i);
});

test('the smoke-free point only exists once there is something to be free of', () => {
  const before = scoreDay(day(d(0), { smokeFree: null }), profile);
  assert.ok(!keys(before).includes('smoke_free'));
  const after = scoreDay(day(d(0), { smokeFree: true }), profile);
  assert.ok(keys(after).includes('smoke_free'));
  const relapsed = scoreDay(day(d(0), { smokeFree: false }), profile);
  assert.ok(!keys(relapsed).includes('smoke_free'));
});

test('achievements are pure over the history, so a correction corrects the badge', () => {
  const base = {
    profile, date: d(3), days: [d(0), d(1), d(2), d(3)],
    dailyLogs: [], meals: [], labs: [], scans: [], plans: [],
    workouts: [], hitStreakBest: 0, smokeFreeClean: 0,
  };
  const none = evaluateAchievements(base);
  assert.equal(none.find((a) => a.id === 'first_session').unlocked, false);

  const withOne = evaluateAchievements({ ...base, workouts: [{ date: d(0), completed: true, type: 'zone2' }] });
  assert.equal(withOne.find((a) => a.id === 'first_session').unlocked, true);

  // Remove it again (a correction) and the badge goes away.
  assert.equal(evaluateAchievements(base).find((a) => a.id === 'first_session').unlocked, false);
});

test('a skipped workout does not unlock the first-session badge', () => {
  const res = evaluateAchievements({
    profile, date: d(1), days: [d(0)], dailyLogs: [], meals: [], labs: [], scans: [], plans: [],
    workouts: [{ date: d(0), completed: false, type: 'other' }],
  });
  assert.equal(res.find((a) => a.id === 'first_session').unlocked, false);
});

test('the zone-2 discipline badge only counts sessions inside the calibrated band', () => {
  const lo = profile.training.zone2.hr_low;
  const hi = profile.training.zone2.hr_high;
  const inBand = Array.from({ length: 5 }, (_, i) => ({
    date: d(i), completed: true, type: 'zone2', avg_hr: lo + 5,
  }));
  const tooHard = inBand.map((w) => ({ ...w, avg_hr: hi + 20 }));
  const base = { profile, date: d(5), days: [], dailyLogs: [], meals: [], labs: [], scans: [], plans: [] };
  assert.equal(evaluateAchievements({ ...base, workouts: inBand }).find((a) => a.id === 'zone2_discipline').unlocked, true);
  assert.equal(evaluateAchievements({ ...base, workouts: tooHard }).find((a) => a.id === 'zone2_discipline').unlocked, false);
});

test('the scoreboard sums days plus achievement bonuses', () => {
  const days = [d(0), d(1)];
  const history = buildHistory({
    profile, date: d(1), days,
    dailyLogs: [{ date: d(0), recovery_pct: 70, sleep_hours: 8 }],
    meals: [], workouts: [{ date: d(0), completed: true, type: 'strength', session_label: 'A' }],
    labs: [], scans: [], smokingMap: new Map(),
  });
  const s = scoreboard(history);
  assert.ok(s.total > 0);
  assert.equal(s.total, s.dailyXp + s.achievementXp);
  assert.equal(s.achievementCount, ACHIEVEMENTS.length);
  assert.ok(s.perDay.length === days.length);
});

test('every XP rule, level and achievement has copy in both languages', () => {
  for (const l of LANGS) {
    for (const r of XP_RULES) assert.ok(XP_NAMES[l][r.key], `${l} missing xp name ${r.key}`);
    for (const a of ACHIEVEMENTS) {
      const meta = ACHIEVEMENT_NAMES[l][a.id];
      assert.ok(meta && meta[0] && meta[1], `${l} missing achievement copy ${a.id}`);
    }
    for (const lv of LEVELS) assert.ok(LEVEL_NAMES[l][lv.level], `${l} missing level name ${lv.level}`);
  }
});

test('the two dashboard string tables have identical keys', () => {
  const ar = Object.keys(STRINGS.ar);
  const en = Object.keys(STRINGS.en);
  assert.deepEqual(ar.filter((k) => !en.includes(k)), []);
  assert.deepEqual(en.filter((k) => !ar.includes(k)), []);
});
