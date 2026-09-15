import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProfile } from '../src/profile.js';
import { stableSystem, stateSystem } from '../src/coach/prompt.js';
import { planForDay } from '../src/domain/program.js';
import { targetsFor, dayTotals } from '../src/domain/targets.js';
import * as F from '../src/bot/format.js';
import { parseLooseJson } from '../src/coach/client.js';
import fs from 'node:fs';

// The real profile when it is present, the committed example otherwise, so the
// suite runs on a fresh clone that has no personal data in it yet.
const PROFILE_PATH = process.env.TEST_PROFILE
  ?? (fs.existsSync('./config/profile.json') ? './config/profile.json' : './config/profile.example.json');
const profile = loadProfile(PROFILE_PATH);

test('the system prompt carries every hard guardrail', () => {
  const s = stableSystem(profile, '2026-09-15');
  for (const g of profile.guardrails) {
    assert.ok(s.includes(g), `missing guardrail: ${g.slice(0, 40)}`);
  }
  assert.match(s, /chest pain/i);
  assert.match(s, /seek care/i);
});

test('the system prompt carries the constraints that make advice wrong if missed', () => {
  const s = stableSystem(profile, '2026-09-15');
  // Every hard constraint must survive into the prompt verbatim - dropping one
  // is how the coach ends up recommending lentils to someone with IBS.
  for (const c of profile.nutrition.hard_constraints) {
    assert.ok(s.includes(c), `missing constraint: ${c.slice(0, 40)}`);
  }
  assert.match(s, /legume/i, 'IBS legume exclusion');
  assert.match(s, /caffeine/i);
  assert.match(s, /110-125/, 'calibrated zone 2 band');
  assert.match(s, /Never tell him to chase the blue Zone 2 bar/i);
  for (const r of profile.nutrition.counting_rules ?? []) {
    assert.ok(s.includes(r), `missing counting rule: ${r.slice(0, 40)}`);
  }
  assert.match(s, /Never miss twice/i);
  assert.match(s, /maintenance|deficit pauses/i, 'quit-window calorie rule');
  assert.match(s, /10-15%/, 'the honest LDL ceiling');
});

test('the system prompt never hard-codes personal facts in source', () => {
  // Everything personal must come from the profile, so a different profile
  // produces a different prompt with no leakage from the old one.
  const other = structuredClone(profile);
  other.user.name = 'Someone Else';
  other.nutrition.protein_g_target = 99;
  const s = stableSystem(other, '2026-09-15');
  assert.ok(s.includes('Someone Else'));
  assert.ok(!s.includes(profile.user.name));
  assert.match(s, /99/);
});

test('the state block reports what is missing rather than inventing it', () => {
  const date = '2026-09-15';
  const plan = planForDay(date, profile);
  const targets = targetsFor(date, profile);
  const s = stateSystem({
    date, time: '07:00', timezone: 'Asia/Riyadh', weekdayName: 'الثلاثاء',
    week: plan.week, plan, targets, totals: dayTotals([], targets), workoutsToday: [],
  });
  assert.match(s, /Recovery not logged yet today/);
  assert.match(s, /Nothing trained yet today/);
});

test('the state block escalates a broken never-miss-twice rule', () => {
  const date = '2026-09-16';
  const plan = planForDay(date, profile);
  const targets = targetsFor(date, profile);
  const s = stateSystem({
    date, time: '21:00', timezone: 'Asia/Riyadh', weekdayName: 'الأربعاء',
    week: plan.week, plan, targets, totals: dayTotals([], targets), workoutsToday: [],
    streak: { misses: 2, broken: true, atRisk: false },
  });
  assert.match(s, /never miss twice/i);
});

test('loose JSON survives code fences and surrounding prose', () => {
  assert.deepEqual(parseLooseJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseLooseJson('Here you go: {"a":1} hope that helps'), { a: 1 });
  assert.deepEqual(parseLooseJson('{"a":1}'), { a: 1 });
  assert.equal(parseLooseJson('not json at all'), null);
  assert.equal(parseLooseJson(''), null);
});

test('mixed Arabic and Latin runs are bidi-isolated so numbers do not reorder', () => {
  const plan = planForDay('2026-09-14', profile, { recoveryPct: 50, sleepHours: 7.5 });
  const line = F.sessionLine(plan);
  assert.ok(line.includes('⁦') && line.includes('⁩'), 'no isolate marks in the session line');
  // The isolated run must contain the whole Latin phrase, not part of it.
  const runs = [...line.matchAll(/⁦([^⁩]*)⁩/g)].map((m) => m[1]);
  assert.ok(runs.includes('110-125 bpm'));
  assert.ok(runs.includes('Zone 2'));
});
