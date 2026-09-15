import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProfile } from '../src/profile.js';
import { targetsFor, dayTotals, proteinFix, QUIT_MAINTENANCE_DAYS } from '../src/domain/targets.js';
import { addDays } from '../src/lib/time.js';

const profile = loadProfile(process.env.TEST_PROFILE ?? './config/profile.example.json');
const QUIT = profile.smoking.quit_date;

test('a normal day runs the deficit', () => {
  const t = targetsFor(addDays(QUIT, -1), profile);
  assert.equal(t.deficitPaused, false);
  assert.equal(t.kcal, profile.nutrition.kcal_target);
});

test('the deficit pauses for the four weeks after the quit date', () => {
  for (const offset of [0, 1, 13, QUIT_MAINTENANCE_DAYS - 1]) {
    const t = targetsFor(addDays(QUIT, offset), profile);
    assert.equal(t.deficitPaused, true, `day ${offset}`);
    assert.equal(t.kcal, profile.nutrition.kcal_maintenance, `day ${offset}`);
  }
});

test('the deficit resumes on day twenty-nine', () => {
  const t = targetsFor(addDays(QUIT, QUIT_MAINTENANCE_DAYS), profile);
  assert.equal(t.deficitPaused, false);
  assert.equal(t.kcal, profile.nutrition.kcal_target);
});

test('the calorie floor is never breached', () => {
  const starved = structuredClone(profile);
  starved.nutrition.kcal_target = 900;
  const t = targetsFor(addDays(QUIT, -5), starved);
  assert.equal(t.kcal, starved.nutrition.kcal_floor);
  assert.ok(t.kcal >= 1500);
});

test('day totals roll up and surface the protein gap', () => {
  const t = targetsFor(addDays(QUIT, -5), profile);
  const totals = dayTotals([
    { kcal_est: 550, protein_g_est: 28 },
    { kcal_est: 700, protein_g_est: 45, sat_fat_flag: true },
  ], t);
  assert.equal(totals.kcal, 1250);
  assert.equal(totals.protein, 73);
  assert.equal(totals.satFatFlags, 1);
  assert.equal(totals.proteinGap, t.protein_g - 73);
});

test('the protein fix is one specific food, and never a legume', () => {
  const fix = proteinFix(40);
  assert.ok(fix && fix.text);
  for (const g of [5, 20, 45, 90]) {
    const f = proteinFix(g);
    assert.doesNotMatch(`${f.text} ${f.en}`, /bean|lentil|chickpea|فول|عدس|حمص/i);
  }
  assert.equal(proteinFix(0), null);
});
