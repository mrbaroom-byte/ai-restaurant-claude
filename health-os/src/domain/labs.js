// Lab trends. Directional, never diagnostic - the cardiologist decides meaning.

import { MARKERS } from '../lib/units.js';

/** Bucket a mg/dL value against the profile's thresholds for that marker. */
export function classify(markerKey, valueMgdl, thresholds) {
  const bands = thresholds?.[markerKey];
  if (!bands || valueMgdl == null) return null;
  for (const b of bands) if (valueMgdl >= b.at) return b;
  return bands[bands.length - 1];
}

/**
 * Per-marker trend across the supplied lab rows (newest first is not assumed).
 * Rows: { marker, drawn_on, value, unit, value_mgdl, flag }
 */
export function trends(rows, thresholds = {}) {
  const byMarker = new Map();
  for (const r of rows) {
    if (!byMarker.has(r.marker)) byMarker.set(r.marker, []);
    byMarker.get(r.marker).push(r);
  }
  const out = [];
  for (const [marker, list] of byMarker) {
    list.sort((a, b) => String(b.drawn_on).localeCompare(String(a.drawn_on)));
    const latest = list[0];
    const prior = list[1] ?? null;
    const lv = num(latest.value_mgdl ?? latest.value);
    const pv = prior ? num(prior.value_mgdl ?? prior.value) : null;
    const delta = lv != null && pv != null ? round2(lv - pv) : null;
    const pct = delta != null && pv ? Math.round((delta / pv) * 100) : null;
    out.push({
      marker,
      label: MARKERS[marker]?.label ?? marker,
      latest,
      prior,
      latestValue: lv,
      priorValue: pv,
      delta,
      pctChange: pct,
      // "worse" is marker-specific: more HDL is good, more LDL is not.
      direction: delta == null ? null : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
      worse: delta == null ? null : HIGHER_IS_BETTER.has(marker) ? delta < 0 : delta > 0,
      band: classify(marker, lv, thresholds),
      history: list,
    });
  }
  // Put the markers that matter most first.
  const order = ['ldl', 'non_hdl', 'total_cholesterol', 'hdl', 'triglycerides', 'lp_a', 'apob', 'hba1c'];
  out.sort((a, b) => rank(order, a.marker) - rank(order, b.marker) || a.marker.localeCompare(b.marker));
  return out;
}

const HIGHER_IS_BETTER = new Set(['hdl', 'egfr', 'vitamin_d']);

function rank(order, key) { const i = order.indexOf(key); return i === -1 ? 999 : i; }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function round2(n) { return Math.round(n * 100) / 100; }

/** Markers the profile says are still outstanding, for the open-items nudge. */
export function missingMarkers(rows, wanted) {
  const have = new Set(rows.map((r) => r.marker));
  return (wanted ?? []).filter((m) => !have.has(m));
}
