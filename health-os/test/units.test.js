import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseLab, toMgdl, canonicalMarker, MMOL_TO_MGDL } from '../src/lib/units.js';

// Synthetic values throughout. The point of these tests is the arithmetic and
// the plausibility gate, not any particular person's panel.

test('cholesterol-family markers convert at 38.67 mg/dL per mmol/L', () => {
  assert.equal(MMOL_TO_MGDL.cholesterol, 38.67);
  assert.equal(toMgdl('ldl', 4, 'mmol/L'), 154.68);
  assert.equal(toMgdl('total_cholesterol', 5, 'mmol/L'), 193.35);
  assert.equal(toMgdl('hdl', 1, 'mmol/L'), 38.67);
  assert.equal(toMgdl('non_hdl', 3, 'mmol/L'), 116.01);
});

test('triglycerides use their own factor, not the cholesterol one', () => {
  assert.equal(MMOL_TO_MGDL.triglycerides, 88.57);
  assert.equal(toMgdl('triglycerides', 2, 'mmol/L'), 177.14);
  assert.notEqual(toMgdl('triglycerides', 2, 'mmol/L'), toMgdl('ldl', 2, 'mmol/L'));
});

test('mg/dL values pass through untouched', () => {
  assert.equal(toMgdl('ldl', 150, 'mg/dL'), 150);
  assert.equal(toMgdl('ldl', 150, ''), 150);
});

test('markers without a mg/dL form return null rather than a wrong number', () => {
  assert.equal(toMgdl('hba1c', 5.3, '%'), null);
  assert.equal(toMgdl('vitamin_d', 22, 'ng/mL'), null);
  assert.equal(toMgdl('tsh', 1.9, 'mIU/L'), null);
});

test('a mmol/L figure pasted into a mg/dL column is rejected, not stored', () => {
  const tc = normaliseLab({ marker: 'Total cholesterol', value: 5, unit: 'mg/dL' });
  assert.equal(tc.suspect, true);
  assert.equal(tc.value_mgdl, null, 'a suspect reading must not carry a converted value');
  assert.match(tc.reason, /mmol\/L/, 'the reason should point at the likely unit mix-up');

  const tg = normaliseLab({ marker: 'Triglycerides', value: 2, unit: 'mg/dL' });
  assert.equal(tg.suspect, true);
});

test('a negative concentration is always suspect', () => {
  const r = normaliseLab({ marker: 'remnant cholesterol', value: -40, unit: 'mg/dL' });
  assert.equal(r.suspect, true);
  assert.match(r.reason, /Negative/);
});

test('values in range are not flagged', () => {
  for (const r of [
    { marker: 'ldl', value: 4.2, unit: 'mmol/L' },
    { marker: 'ldl', value: 162, unit: 'mg/dL' },
    { marker: 'hba1c', value: 5.3, unit: '%' },
    { marker: 'non_hdl', value: 140, unit: 'mg/dL' },
  ]) assert.equal(normaliseLab(r).suspect, false, JSON.stringify(r));
});

test('a non-numeric or unknown reading is suspect rather than silently dropped', () => {
  assert.equal(normaliseLab({ marker: 'ldl', value: 'n/a', unit: 'mg/dL' }).suspect, true);
  assert.equal(normaliseLab({ marker: 'zzz', value: 1, unit: '' }).suspect, true);
});

test('marker aliases resolve', () => {
  assert.equal(canonicalMarker('LDL-C'), 'ldl');
  assert.equal(canonicalMarker('Lp(a)'), 'lp_a');
  assert.equal(canonicalMarker('A1c'), 'hba1c');
  assert.equal(canonicalMarker('Non-HDL cholesterol'), 'non_hdl');
  assert.equal(canonicalMarker('not a marker'), null);
});
