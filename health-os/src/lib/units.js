// Lab unit handling.
//
// Why this file exists: labs in this region report lipids in mmol/L, and a
// biomarker export once dropped those figures straight into mg/dL columns. The
// result is a single-digit "mg/dL" cholesterol and a negative remnant value -
// numbers that look like data and are not. Every lab reading entering the
// system goes through `normaliseLab`, which converts by marker family and
// refuses anything outside a physiologically possible range.

/** mmol/L -> mg/dL multipliers, by what the molecule weighs. */
export const MMOL_TO_MGDL = {
  cholesterol: 38.67,   // total, LDL, HDL, non-HDL, remnant
  triglycerides: 88.57,
  glucose: 18.016,
};

/** Canonical marker keys -> how they convert and how they are judged. */
export const MARKERS = {
  total_cholesterol: { label: 'Total cholesterol', family: 'cholesterol', mgdl: true, plausible: [50, 600] },
  ldl:               { label: 'LDL',               family: 'cholesterol', mgdl: true, plausible: [20, 500] },
  hdl:               { label: 'HDL',               family: 'cholesterol', mgdl: true, plausible: [10, 150] },
  non_hdl:           { label: 'Non-HDL',           family: 'cholesterol', mgdl: true, plausible: [20, 500] },
  remnant_cholesterol: { label: 'Remnant cholesterol', family: 'cholesterol', mgdl: true, plausible: [0, 200] },
  triglycerides:     { label: 'Triglycerides',     family: 'triglycerides', mgdl: true, plausible: [20, 1500] },
  lp_a:              { label: 'Lp(a)',             family: null, mgdl: false, plausible: [0, 400] },
  apob:              { label: 'ApoB',              family: null, mgdl: false, plausible: [20, 300] },
  glucose:           { label: 'Fasting glucose',   family: 'glucose', mgdl: true, plausible: [40, 500] },
  hba1c:             { label: 'HbA1c',             family: null, mgdl: false, plausible: [3, 20] },
  hs_crp:            { label: 'hs-CRP',            family: null, mgdl: false, plausible: [0, 50] },
  vitamin_d:         { label: 'Vitamin D',         family: null, mgdl: false, plausible: [3, 150] },
  tsh:               { label: 'TSH',               family: null, mgdl: false, plausible: [0, 100] },
  ft4:               { label: 'Free T4',           family: null, mgdl: false, plausible: [0, 10] },
  tpo_ab:            { label: 'TPO antibodies',    family: null, mgdl: false, plausible: [0, 2000] },
  ferritin:          { label: 'Ferritin',          family: null, mgdl: false, plausible: [1, 2000] },
  iron:              { label: 'Iron',              family: null, mgdl: false, plausible: [10, 400] },
  alt:               { label: 'ALT',               family: null, mgdl: false, plausible: [1, 500] },
  ast:               { label: 'AST',               family: null, mgdl: false, plausible: [1, 500] },
  alp:               { label: 'ALP',               family: null, mgdl: false, plausible: [10, 500] },
  calcium:           { label: 'Calcium',           family: null, mgdl: false, plausible: [5, 15] },
  creatinine:        { label: 'Creatinine',        family: null, mgdl: false, plausible: [0.2, 12] },
  egfr:              { label: 'eGFR',              family: null, mgdl: false, plausible: [5, 200] },
  sbp:               { label: 'Systolic BP',       family: null, mgdl: false, plausible: [70, 260] },
  dbp:               { label: 'Diastolic BP',      family: null, mgdl: false, plausible: [40, 160] },
};

const ALIASES = {
  'total cholesterol': 'total_cholesterol', cholesterol: 'total_cholesterol', tc: 'total_cholesterol',
  'ldl-c': 'ldl', 'ldl cholesterol': 'ldl', ldlc: 'ldl',
  'hdl-c': 'hdl', 'hdl cholesterol': 'hdl',
  'non hdl': 'non_hdl', 'non-hdl': 'non_hdl', 'non-hdl cholesterol': 'non_hdl',
  tg: 'triglycerides', trigs: 'triglycerides',
  'lp(a)': 'lp_a', lpa: 'lp_a',
  'apo b': 'apob', 'apolipoprotein b': 'apob',
  a1c: 'hba1c', 'hemoglobin a1c': 'hba1c', 'haemoglobin a1c': 'hba1c',
  crp: 'hs_crp', 'hs crp': 'hs_crp',
  'vitamin d3': 'vitamin_d', '25-oh vitamin d': 'vitamin_d', 'vit d': 'vitamin_d',
  't4': 'ft4', 'free t4': 'ft4',
  'tpo': 'tpo_ab', 'anti-tpo': 'tpo_ab',
  systolic: 'sbp', diastolic: 'dbp',
};

/** Loosely-typed marker name -> canonical key, or null. */
export function canonicalMarker(name) {
  if (!name) return null;
  const k = String(name).trim().toLowerCase().replace(/\s+/g, ' ');
  if (MARKERS[k]) return k;
  const snake = k.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (MARKERS[snake]) return snake;
  return ALIASES[k] ?? ALIASES[snake] ?? null;
}

function normUnit(unit) {
  return String(unit ?? '').trim().toLowerCase().replace(/\s+/g, '');
}

/**
 * Convert a reported value to mg/dL when the marker has a mg/dL form.
 * Returns null for markers measured in %, ng/mL, IU/L and friends.
 */
export function toMgdl(markerKey, value, unit) {
  const spec = MARKERS[markerKey];
  if (!spec || !spec.mgdl) return null;
  const u = normUnit(unit);
  if (u === 'mmol/l' || u === 'mmoll' || u === 'mmol') {
    const factor = MMOL_TO_MGDL[spec.family];
    if (!factor) return null;
    return round2(value * factor);
  }
  if (u === 'mg/dl' || u === 'mgdl' || u === 'mg%' || u === '') return round2(value);
  return null;
}

function round2(n) { return Math.round(n * 100) / 100; }

/**
 * Normalise one incoming lab reading.
 *
 * Returns { marker, value, unit, value_mgdl, suspect, reason }.
 * `suspect` is true when the number cannot be right - most often because a
 * mmol/L figure was pasted into a mg/dL column. The caller should surface the
 * warning rather than silently storing a wrong number.
 */
export function normaliseLab({ marker, value, unit }) {
  const key = canonicalMarker(marker);
  const num = typeof value === 'number' ? value : Number(String(value).trim());
  if (!key) return { marker: null, value: num, unit, value_mgdl: null, suspect: true, reason: `Unknown marker "${marker}"` };
  if (!Number.isFinite(num)) return { marker: key, value: null, unit, value_mgdl: null, suspect: true, reason: 'Value is not a number' };

  const spec = MARKERS[key];
  let mgdl = toMgdl(key, num, unit);
  let suspect = false;
  let reason = null;

  if (num < 0) {
    suspect = true;
    reason = `Negative ${spec.label} - the source is almost certainly a broken conversion.`;
  }

  // The tell-tale export bug: a cholesterol-family value labelled mg/dL that is
  // in fact the mmol/L figure. A single-digit mg/dL cholesterol is not
  // survivable; the same number in mmol/L is an ordinary high reading.
  const comparand = mgdl ?? num;
  const [lo, hi] = spec.plausible;
  if (!suspect && Number.isFinite(comparand) && (comparand < lo || comparand > hi)) {
    suspect = true;
    if (spec.family && comparand < lo) {
      const asMmol = round2(num * MMOL_TO_MGDL[spec.family]);
      reason = `${spec.label} of ${num} ${unit || 'mg/dL'} is outside the plausible range `
        + `(${lo}-${hi} mg/dL). Reading it as mmol/L gives ${asMmol} mg/dL - check the source unit.`;
      mgdl = null;
    } else {
      reason = `${spec.label} of ${comparand} is outside the plausible range (${lo}-${hi}).`;
    }
  }

  return { marker: key, value: num, unit: unit ?? null, value_mgdl: mgdl, suspect, reason };
}
