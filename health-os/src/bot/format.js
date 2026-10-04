// Message formatting for Telegram, in either language.
//
// Plain text only - markdown escaping around Arabic punctuation is a liability
// and buys nothing here.

import { L } from './strings.js';

export const BAND_MARK = { green: '🟢', yellow: '🟡', red: '🔴' };
export const READY_MARK = { push: '↑', maintain: '→', pull_back: '↓', rest: '—' };

/**
 * Wrap a Latin/numeric run in Unicode isolates so the bidi algorithm does not
 * reorder it inside an Arabic sentence. Without this, "1 / 6" renders as
 * "6 / 1" and "Zone 2 20 min" comes out with the number in front. Works in
 * Telegram and in HTML alike, unlike a <span dir="ltr">.
 */
export const ltr = (s) => `⁦${s}⁩`;

/** Isolates are only needed in RTL; in English they are noise in the transcript. */
const iso = (lang, s) => (lang === 'ar' ? ltr(s) : String(s));

export function num(n, digits = 0) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return Number(n).toFixed(digits).replace(/\.0+$/, '');
}

/** The session line, after the recovery overlay has been applied. */
export function sessionLine(lang, plan) {
  const t = L(lang);
  if (!plan.isTrainingDay) return lang === 'ar' ? 'راحة · حركة خفيفة ومراجعة الأسبوع' : 'Rest · light movement and the weekly review';
  const a = plan.adjusted;
  const bits = [];
  if (a.zone2) {
    const mins = `${a.zone2.minutes}${a.zone2.maxMinutes ? `-${a.zone2.maxMinutes}` : ''}`;
    const unit = lang === 'ar' ? 'دقيقة' : 'min';
    bits.push(`${iso(lang, 'Zone 2')} ${iso(lang, mins)} ${unit} @ ${iso(lang, `${a.zone2.hrLow}-${a.zone2.hrHigh} bpm`)}`);
  }
  if (a.isLiftDay) bits.push(iso(lang, `Strength ${plan.strengthLabel}`));
  if (a.walkLong) {
    bits.push(a.walkMinutes
      ? (lang === 'ar' ? `مشي هادئ ${iso(lang, a.walkMinutes)} دقيقة` : `Easy walk ${a.walkMinutes} min`)
      : (lang === 'ar' ? 'مشي طويل هادئ' : 'Long easy walk'));
  }
  if (a.strengthDeferred) {
    const s = iso(lang, `Strength ${a.strengthDeferred}`);
    bits.push(lang === 'ar' ? `(${s} تأجّل يوم)` : `(${s} pushed a day)`);
  }
  return bits.join(' → ') || t('rest');
}

export function exerciseList(plan) {
  if (!plan.adjusted.isLiftDay || !plan.strengthExercises.length) return '';
  return plan.strengthExercises.map((e, i) => `  ${i + 1}. ${e}`).join('\n');
}

export function recoveryLine(lang, plan) {
  const t = L(lang);
  const r = plan.recovery;
  if (r.pct == null) return t('recoveryMissing');
  const mark = BAND_MARK[r.effectiveBand] ?? '';
  const extra = r.sleepDowngrade ? ` (${t('sleepDowngrade')})` : '';
  return `${mark} ${iso(lang, `Recovery ${r.pct}%`)}${extra} · ${t('readiness')}: ${t(plan.readiness)}`;
}

export function macroLine(lang, totals, targets) {
  const p = lang === 'ar'
    ? `بروتين ${iso(lang, `${num(totals.protein)} / ${targets.protein_g}`)} جم`
    : `Protein ${num(totals.protein)} / ${targets.protein_g} g`;
  const k = lang === 'ar'
    ? `سعرات ${iso(lang, `${num(totals.kcal)} / ${targets.kcal}`)}`
    : `Calories ${num(totals.kcal)} / ${targets.kcal}`;
  return `${p} · ${k}`;
}

/** The dashboard link, if a token is configured. */
export function dashboardUrl(lang) {
  const base = process.env.PUBLIC_BASE_URL;
  const token = process.env.DASHBOARD_TOKEN;
  if (!base || !token) return null;
  return `${base.replace(/\/$/, '')}/dashboard?token=${encodeURIComponent(token)}&lang=${lang}`;
}

export function labLine(lang, trend) {
  const v = trend.latest.value_mgdl ?? trend.latest.value;
  const unit = trend.latest.value_mgdl ? 'mg/dL' : (trend.latest.unit ?? '');
  // The arrow shows which way the number moved; the flag shows whether that is
  // bad. For HDL those disagree - it fell, and falling is the bad direction.
  const arrow = trend.delta == null ? '' : trend.direction === 'up' ? ' ↑' : trend.direction === 'down' ? ' ↓' : '';
  const flag = trend.worse ? ' ⚠' : '';
  const since = lang === 'ar' ? 'منذ' : 'since';
  const move = trend.delta == null ? ''
    : ` (${trend.delta > 0 ? '+' : ''}${num(trend.delta, 1)} ${since} ${trend.prior.drawn_on})`;
  const band = trend.band ? ` — ${trend.band.label}` : '';
  return `${trend.label}: ${num(v, 1)} ${unit}${arrow}${flag}${move}${band}`;
}

export function estimateCard(lang, est) {
  const conf = lang === 'ar'
    ? { low: 'تقدير تقريبي', med: 'تقدير متوسط الدقة', high: 'تقدير جيد' }[est.confidence]
    : { low: 'rough estimate', med: 'moderate confidence', high: 'good estimate' }[est.confidence];
  const macros = lang === 'ar'
    ? `≈ ${est.kcal_est} سعرة · ${est.protein_g_est} جم بروتين${est.fibre_g_est ? ` · ${est.fibre_g_est} جم ألياف` : ''}`
    : `≈ ${est.kcal_est} kcal · ${est.protein_g_est} g protein${est.fibre_g_est ? ` · ${est.fibre_g_est} g fibre` : ''}`;
  const satFat = lang === 'ar' ? '⚠️ حمولة دهون مشبعة ملحوظة' : '⚠️ meaningful saturated fat load';
  return [
    `🍽️ ${est.description}`,
    est.items.length ? est.items.map((i) => `• ${i}`).join('\n') : '',
    macros,
    est.sat_fat_flag ? satFat : '',
    `(${conf})`,
    est.note ? `\n${est.note}` : '',
  ].filter(Boolean).join('\n');
}

/** Field names as he should read them back, not as the database spells them. */
export const METRIC_NAMES = {
  ar: {
    recovery_pct: 'التعافي', sleep_hours: 'النوم', resting_hr: 'نبض الراحة',
    steps: 'الخطوات', weight_kg: 'الوزن', notes: 'ملاحظة', smoke_free: 'بدون تدخين',
  },
  en: {
    recovery_pct: 'Recovery', sleep_hours: 'Sleep', resting_hr: 'Resting HR',
    steps: 'Steps', weight_kg: 'Weight', notes: 'Note', smoke_free: 'Smoke-free',
  },
};

/** Arabic uses '،'; English does not. */
export const listSep = (lang) => (lang === 'en' ? ', ' : '، ');

export function metricName(lang, key) {
  return (METRIC_NAMES[lang] ?? METRIC_NAMES.ar)[key] ?? key;
}

export { iso };
