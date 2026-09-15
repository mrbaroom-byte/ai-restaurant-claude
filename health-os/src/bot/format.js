// Message formatting. Arabic for coaching, English for technical detail.
// Plain text only - Telegram markdown escaping is a liability around Arabic
// punctuation and adds nothing here.

export const BAND_MARK = { green: '🟢', yellow: '🟡', red: '🔴' };
export const READINESS_AR = {
  push: 'ادفع',
  maintain: 'حافظ',
  pull_back: 'خفّف',
  rest: 'راحة',
};

/**
 * Wrap a Latin/numeric run in Unicode isolates so the bidi algorithm does not
 * reorder it inside an Arabic sentence. Without this, "1 / 6" renders as
 * "6 / 1" and "Zone 2 20 دقيقة" comes out with the number in front. Works in
 * Telegram and in HTML alike, unlike a <span dir="ltr">.
 */
export const ltr = (s) => `\u2066${s}\u2069`;

export function num(n, digits = 0) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return Number(n).toFixed(digits).replace(/\.0+$/, '');
}

/** The session line, after the recovery overlay has been applied. */
export function sessionLine(plan) {
  if (!plan.isTrainingDay) return 'راحة · حركة خفيفة ومراجعة الأسبوع';
  const a = plan.adjusted;
  const bits = [];
  if (a.zone2) {
    const mins = `${a.zone2.minutes}${a.zone2.maxMinutes ? `-${a.zone2.maxMinutes}` : ''}`;
    bits.push(`${ltr('Zone 2')} ${ltr(mins)} دقيقة @ ${ltr(`${a.zone2.hrLow}-${a.zone2.hrHigh} bpm`)}`);
  }
  if (a.isLiftDay) bits.push(ltr(`Strength ${plan.strengthLabel}`));
  if (a.walkLong) bits.push(a.walkMinutes ? `مشي هادئ ${ltr(a.walkMinutes)} دقيقة` : 'مشي طويل هادئ');
  if (a.strengthDeferred) bits.push(`(${ltr(`Strength ${a.strengthDeferred}`)} تأجّل يوم)`);
  return bits.join(' → ') || 'راحة';
}

export function exerciseList(plan) {
  if (!plan.adjusted.isLiftDay || !plan.strengthExercises.length) return '';
  return plan.strengthExercises.map((e, i) => `  ${i + 1}. ${e}`).join('\n');
}

export function recoveryLine(plan) {
  const r = plan.recovery;
  if (r.pct == null) return 'Recovery: غير مسجّل — أرسل: log recovery 55 sleep 7.2 rhr 72';
  const mark = BAND_MARK[r.effectiveBand] ?? '';
  const extra = r.sleepDowngrade ? ' (نزل لأحمر — النوم أقل من 6 ساعات)' : '';
  return `${mark} ${ltr(`Recovery ${r.pct}%`)}${extra} · الجاهزية: ${READINESS_AR[plan.readiness] ?? plan.readiness}`;
}

export function macroLine(totals, targets) {
  const p = `بروتين ${ltr(`${num(totals.protein)} / ${targets.protein_g}`)} جم`;
  const k = `سعرات ${ltr(`${num(totals.kcal)} / ${targets.kcal}`)}`;
  return `${p} · ${k}`;
}

export function supplementLine(schedule, dueIds) {
  return schedule
    .filter(({ slot }) => slot !== 'as-needed')
    .map(({ slot, items }) => `  ${slot} — ${items.map((s) => s.name).join('، ')}`)
    .join('\n');
}

/** The dashboard link, if a token is configured. */
export function dashboardUrl() {
  const base = process.env.PUBLIC_BASE_URL;
  const token = process.env.DASHBOARD_TOKEN;
  if (!base || !token) return null;
  return `${base.replace(/\/$/, '')}/dashboard?token=${encodeURIComponent(token)}`;
}

export function labLine(trend) {
  const v = trend.latest.value_mgdl ?? trend.latest.value;
  const unit = trend.latest.value_mgdl ? 'mg/dL' : (trend.latest.unit ?? '');
  // The arrow shows which way the number moved; the flag shows whether that is
  // bad. For HDL those disagree - it fell, and falling is the bad direction.
  const arrow = trend.delta == null ? '' : trend.direction === 'up' ? ' ↑' : trend.direction === 'down' ? ' ↓' : '';
  const flag = trend.worse ? ' ⚠' : '';
  const move = trend.delta == null ? '' : ` (${trend.delta > 0 ? '+' : ''}${num(trend.delta, 1)} منذ ${trend.prior.drawn_on})`;
  const band = trend.band ? ` — ${trend.band.label}` : '';
  return `${trend.label}: ${num(v, 1)} ${unit}${arrow}${flag}${move}${band}`;
}

export function estimateCard(est) {
  const conf = { low: 'تقدير تقريبي', med: 'تقدير متوسط الدقة', high: 'تقدير جيد' }[est.confidence] ?? est.confidence;
  const lines = [
    `🍽️ ${est.description}`,
    est.items.length ? est.items.map((i) => `• ${i}`).join('\n') : '',
    `≈ ${est.kcal_est} سعرة · ${est.protein_g_est} جم بروتين${est.fibre_g_est ? ` · ${est.fibre_g_est} جم ألياف` : ''}`,
    est.sat_fat_flag ? '⚠️ حمولة دهون مشبعة ملحوظة' : '',
    `(${conf})`,
    est.note ? `\n${est.note}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

/** Field names as he should read them back, not as the database spells them. */
export const METRIC_AR = {
  recovery_pct: 'التعافي',
  sleep_hours: 'النوم',
  resting_hr: 'نبض الراحة',
  steps: 'الخطوات',
  weight_kg: 'الوزن',
  notes: 'ملاحظة',
  smoke_free: 'بدون تدخين',
};

export const HELP = `الأوامر:

/day — وين أنت اليوم مقابل الأهداف
/brief — بريف الصباح الآن
/meal <وصف> أو أرسل صورة — تسجيل وجبة وتقدير السعرات والبروتين
/food <صنف> — تقدير سريع بدون تسجيل
/log <...> — تسجيل تمرين أو وزن أو أرقام الصباح
/week — مراجعة الأسبوع
/labs <...> — إدخال تحليل جديد
/rescan <...> — إدخال InBody جديد
/quit <...> — عدّاد الإقلاع وتسجيل الرغبة
/supps — تأشير المكمّلات
/dash — رابط اللوحة

أمثلة /log:
  log recovery 55 sleep 7.2 rhr 72 steps 4200
  log 81.4            (وزن)
  log z2 22
  log strength A rpe 7
  log walk 35 hr 118
  log skipped travel

أي رسالة عادية تروح للمدرّب مباشرة.`;
