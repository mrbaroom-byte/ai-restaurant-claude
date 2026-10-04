// Terse-input parsing. He types "log z2 22 rpe 6", not a form.
// Everything here is pure so it can be tested without a database.

import { canonicalMarker, normaliseLab } from '../lib/units.js';

const NUM = '(-?\\d+(?:[.,]\\d+)?)';

function num(v) {
  if (v == null) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function grab(text, keys, pattern = NUM) {
  const alt = keys.map(escape).join('|');
  const re = new RegExp(`\\b(?:${alt})\\b[\\s:=]*${pattern}`, 'i');
  const m = text.match(re);
  return m ? num(m[1]) : null;
}

function escape(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/**
 * Morning metrics. Recognises English and Arabic keys, in any order:
 *   "recovery 55 sleep 7.2 rhr 72 steps 4200 weight 81.3"
 *   "ريكفري ٥٥" is not handled - he types Latin digits.
 */
export function parseDailyMetrics(text) {
  const t = String(text);
  const out = {};
  const recovery = grab(t, ['recovery', 'rec', 'ريكفري', 'تعافي']);
  const sleep = grab(t, ['sleep', 'slp', 'نوم']);
  // Deliberately NOT a bare `hr`: in "z2 20 hr 118" that is the average heart
  // rate of the session, and treating it as resting HR corrupts the morning row.
  const rhr = grab(t, ['rhr', 'restinghr', 'resting']);
  const steps = grab(t, ['steps', 'step', 'خطوات']);
  const weight = grab(t, ['weight', 'wt', 'kg', 'وزن']);
  if (recovery != null) out.recovery_pct = Math.round(recovery);
  if (sleep != null) out.sleep_hours = sleep;
  if (rhr != null) out.resting_hr = Math.round(rhr);
  if (steps != null) out.steps = Math.round(steps);
  if (weight != null) out.weight_kg = weight;
  return Object.keys(out).length ? out : null;
}

const WORKOUT_WORDS = {
  zone2: ['zone2', 'zone 2', 'z2', 'cardio', 'elliptical', 'bike', 'زون2', 'زون 2', 'كارديو'],
  strength: ['strength', 'lift', 'gym', 'weights', 'حديد', 'قوة'],
  walk: ['walk', 'walking', 'steps walk', 'مشي'],
  other: ['other', 'swim', 'sport', 'رياضة'],
};

/**
 * A workout line. Returns null when nothing looks like training.
 *   "z2 22"            -> zone2, 22 min, 22 zone-2 minutes
 *   "strength A rpe 7" -> strength, session A
 *   "walk 35 hr 118"
 *   "skipped travel"   -> a recorded miss, which is data, not silence
 */
export function parseWorkout(text) {
  const t = String(text).trim();
  if (!t) return null;

  const skip = t.match(/^\s*(?:skip|skipped|missed|ما\s*قدرت|فاتني)\b[\s:،,-]*(.*)$/i);
  if (skip) {
    return { type: 'other', completed: false, skipped_reason: skip[1].trim() || 'not given', duration_min: null };
  }

  let type = null;
  let typeWord = null;
  for (const [key, words] of Object.entries(WORKOUT_WORDS)) {
    const hit = words.find((w) => new RegExp(`(^|\\s)${escape(w)}(\\s|$|\\d)`, 'i').test(t));
    if (hit) { type = key; typeWord = hit; break; }
  }
  if (!type) return null;

  const sessionMatch = t.match(/\b(?:session\s*)?([ab])\b/i);
  const avg = grab(t, ['avghr', 'avg', 'hr']);
  const max = grab(t, ['maxhr', 'max']);
  const rpe = grab(t, ['rpe']);
  const z2 = grab(t, ['z2min', 'zone2min']);

  // Duration: an explicit "N min" wins. Otherwise take the one bare number left
  // once every labelled field and the activity word itself are removed - so
  // "z2 22" is 22 minutes and "strength A rpe 7" has no duration at all.
  let duration = grab(t, ['min', 'mins', 'minutes', 'دقيقة']);
  if (duration == null) {
    let rest = t;
    for (const keys of [['z2min', 'zone2min'], ['maxhr', 'max'], ['avghr', 'avg', 'hr'], ['rpe']]) {
      rest = rest.replace(new RegExp(`\\b(?:${keys.map(escape).join('|')})\\b[\\s:=]*${NUM}`, 'ig'), ' ');
    }
    if (typeWord) rest = rest.replace(new RegExp(escape(typeWord), 'ig'), ' ');
    rest = rest.replace(/\b[ab]\b/ig, ' ');
    const bare = rest.match(new RegExp(`(?:^|\\s)${NUM}\\s*(?:min|m|دقيقة)?(?:\\s|$)`));
    if (bare) duration = num(bare[1]);
  }

  const durationMin = duration != null ? Math.round(duration) : null;
  return {
    type,
    completed: true,
    duration_min: durationMin,
    session_label: type === 'strength' && sessionMatch ? sessionMatch[1].toUpperCase() : null,
    avg_hr: avg != null ? Math.round(avg) : null,
    max_hr: max != null ? Math.round(max) : null,
    // Zone-2 work counts toward the aerobic total; lifting does not.
    zone2_minutes: z2 != null ? Math.round(z2) : (type === 'zone2' ? durationMin : null),
    rpe: rpe ?? null,
  };
}

/** A bare number, or "82.4 kg", meaning weight. */
export function parseWeight(text) {
  const t = String(text).trim();
  const m = t.match(new RegExp(`^${NUM}\\s*(?:kg|كجم|كيلو)?$`, 'i'));
  if (!m) return null;
  const v = num(m[1]);
  return v != null && v > 25 && v < 300 ? v : null;
}

/**
 * Lab entry: "2026-03-04 ldl 4.1 mmol/L, hdl 1.3 mmol/L, hba1c 5.3 %"
 * Date is optional and defaults to the caller's today.
 */
export function parseLabs(text, defaultDate) {
  const t = String(text).trim();
  const dateMatch = t.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  const drawnOn = dateMatch ? dateMatch[1] : defaultDate;
  const body = dateMatch ? t.replace(dateMatch[1], ' ') : t;

  const results = [];
  const problems = [];
  for (const piece of body.split(/[,;\n]+/)) {
    const s = piece.trim();
    if (!s) continue;
    const m = s.match(new RegExp(`^(.+?)[\\s:=]+${NUM}\\s*([a-zA-Z/%µ0-9.^]+)?$`));
    if (!m) { problems.push(`Could not read "${s}"`); continue; }
    const [, rawMarker, rawValue, rawUnit] = m;
    const key = canonicalMarker(rawMarker);
    if (!key) { problems.push(`Unknown marker "${rawMarker.trim()}"`); continue; }
    const normalised = normaliseLab({ marker: key, value: num(rawValue), unit: rawUnit ?? '' });
    results.push({ ...normalised, drawn_on: drawnOn, raw: s });
    if (normalised.suspect) problems.push(normalised.reason);
  }
  return { drawn_on: drawnOn, results, problems };
}

/** Body scan: "2026-10-12 weight 78.5 fat 26 muscle 32.6 visceral 9 whr 1.01 score 72" */
export function parseScan(text, defaultDate) {
  const t = String(text).trim();
  const dateMatch = t.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  const out = {
    scanned_on: dateMatch ? dateMatch[1] : defaultDate,
    weight_kg: grab(t, ['weight', 'wt', 'وزن']),
    body_fat_pct: grab(t, ['fat', 'bodyfat', 'bf', 'دهون']),
    body_fat_kg: grab(t, ['fatkg', 'fat_kg']),
    skeletal_muscle_kg: grab(t, ['muscle', 'smm', 'عضل']),
    visceral_level: grab(t, ['visceral', 'vf', 'حشوي']),
    whr: grab(t, ['whr', 'waisthip']),
    bmi: grab(t, ['bmi']),
    score: grab(t, ['score', 'نقاط']),
  };
  const hasAny = ['weight_kg', 'body_fat_pct', 'skeletal_muscle_kg'].some((k) => out[k] != null);
  return hasAny ? out : null;
}

/** Smoking: "smoked 3", "craving 8 trigger coffee", "clean" */
export function parseSmoking(text) {
  const t = String(text).trim();
  if (!t) return null;
  if (/^(clean|zero|none|نظيف|ولا وحدة|صفر)$/i.test(t)) return { cigarettes: 0 };
  const cigs = grab(t, ['smoked', 'cigs', 'cigarettes', 'دخنت', 'سجاير']);
  const craving = grab(t, ['craving', 'urge', 'رغبة', 'وحام']);
  const trig = t.match(/\b(?:trigger|because|بسبب|محفز)\b[\s:=]*(.+)$/i);
  if (cigs == null && craving == null && !trig) return null;
  return {
    cigarettes: cigs != null ? Math.round(cigs) : null,
    craving_peak: craving != null ? Math.min(10, Math.max(1, Math.round(craving))) : null,
    trigger: trig ? trig[1].trim() : null,
  };
}

/** Split "/cmd rest of line" into its parts. */
export function splitCommand(text) {
  const t = String(text ?? '').trim();
  const m = t.match(/^\/([a-z_]+)(?:@\S+)?\s*([\s\S]*)$/i);
  if (!m) return { command: null, args: t };
  return { command: m[1].toLowerCase(), args: m[2].trim() };
}
