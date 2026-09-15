// The dashboard: one self-contained HTML response, mobile first, using the
// design system from the existing artifacts (limestone / ink / teal / oxide).

import { buildContext } from '../coach/context.js';
import * as repo from '../repo/index.js';
import { addDays, weekStart, dateRange, weekdayOf } from '../lib/time.js';
import { planForDay, weeklyAerobicTarget } from '../domain/program.js';
import { targetsFor, dayTotals } from '../domain/targets.js';
import { lineChart, weekStrip, stat, esc } from './charts.js';
import * as F from '../bot/format.js';

const DAY_AR = { 1: 'إث', 2: 'ثل', 3: 'أر', 4: 'خم', 5: 'جم', 6: 'سب', 7: 'أح' };

export async function renderDashboard(userId, profile, today) {
  const ctx = await buildContext(userId, profile, { date: today });

  const wkStart = weekStart(today);
  const wkEnd = addDays(wkStart, 6);
  const histFrom = addDays(today, -89);

  const [weekWorkouts, dailyRows, mealRows, allWorkouts, labRows, scans] = await Promise.all([
    repo.workouts.between(userId, wkStart, wkEnd),
    repo.dailyLogs.between(userId, histFrom, today),
    repo.meals.between(userId, histFrom, today),
    repo.workouts.between(userId, histFrom, today),
    repo.labs.all(userId),
    repo.bodyScans.all(userId),
  ]);

  /* ---- this week ---- */
  const doneDates = new Set(weekWorkouts.filter((w) => w.completed).map((w) => w.date));
  const days = dateRange(wkStart, wkEnd).map((d) => {
    const plan = planForDay(d, profile);
    const future = d > today;
    let state = 'planned';
    if (!plan.isTrainingDay) state = 'rest';
    else if (doneDates.has(d)) state = 'done';
    else if (!future) state = 'missed';
    return { date: d, label: DAY_AR[weekdayOf(d)], state };
  });
  const aerobicThisWeek = weekWorkouts.reduce((a, w) => a + (Number(w.zone2_minutes) || 0), 0);
  const aerobicTarget = weeklyAerobicTarget(ctx.week, profile) ?? 125;

  /* ---- trends ---- */
  const series = (rows, key) => rows.filter((r) => r[key] != null).map((r) => ({ x: r.date, y: Number(r[key]) }));
  const proteinByDay = [];
  const aerobicByDay = [];
  for (const d of dateRange(histFrom, today)) {
    const dayMeals = mealRows.filter((m) => m.date === d);
    if (dayMeals.length) proteinByDay.push({ x: d, y: dayTotals(dayMeals, targetsFor(d, profile)).protein });
    const mins = allWorkouts.filter((w) => w.date === d).reduce((a, w) => a + (Number(w.zone2_minutes) || 0), 0);
    aerobicByDay.push({ x: d, y: mins });
  }

  /* ---- labs ---- */
  const ldl = ctx.labTrends.find((t) => t.marker === 'ldl');
  const tc = ctx.labTrends.find((t) => t.marker === 'total_cholesterol');
  const labSeries = (marker) => (ctx.labTrends.find((t) => t.marker === marker)?.history ?? [])
    .slice().sort((a, b) => String(a.drawn_on).localeCompare(String(b.drawn_on)))
    .map((r) => ({ x: r.drawn_on, y: Number(r.value_mgdl ?? r.value) }));

  /* ---- history payload for the client-side filter ---- */
  const history = [
    ...mealRows.map((m) => ({ d: m.date, t: 'meal', s: m.description, m: `${m.kcal_est ?? '?'} kcal · ${m.protein_g_est ?? '?'} g P${m.sat_fat_flag ? ' · ⚠️ sat fat' : ''} · ${m.confidence}` })),
    ...allWorkouts.map((w) => ({
      d: w.date, t: 'workout',
      s: `${w.type}${w.session_label ? ` ${w.session_label}` : ''}${w.completed ? '' : ' (skipped)'}`,
      m: [w.duration_min ? `${w.duration_min} min` : '', w.zone2_minutes ? `${w.zone2_minutes} z2` : '',
          w.avg_hr ? `avg ${w.avg_hr}` : '', w.rpe ? `RPE ${w.rpe}` : '', w.skipped_reason ?? ''].filter(Boolean).join(' · '),
    })),
  ].sort((a, b) => b.d.localeCompare(a.d)).slice(0, 400);

  const scan = scans[0] ?? null;
  const t = ctx.targets;

  return page({ ctx, profile, days, aerobicThisWeek, aerobicTarget, series, dailyRows,
    proteinByDay, aerobicByDay, ldl, tc, labSeries, history, scan, targets: t });
}

function page(v) {
  const { ctx, profile, days, aerobicThisWeek, aerobicTarget, series, dailyRows,
          proteinByDay, aerobicByDay, ldl, tc, labSeries, history, scan, targets } = v;

  const smoke = ctx.smokeFree;
  const sessionsDone = days.filter((d) => d.state === 'done').length;
  const trainingDays = days.filter((d) => d.state !== 'rest').length;

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>Health OS</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --paper: #E9E6DE;
    --ink: #1C2321;
    --teal: #17605C;
    --oxide: #A4442F;
    --rule: #C6C2B6;
    --muted: #7C7767;
    --card: #F3F1EB;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--paper);
    color: var(--ink);
    font-family: 'IBM Plex Sans Arabic', 'Archivo', system-ui, sans-serif;
    font-size: 15px;
    line-height: 1.55;
    -webkit-text-size-adjust: 100%;
  }
  .wrap { max-width: 720px; margin: 0 auto; padding: 20px 16px 64px; }
  header { border-bottom: 2px solid var(--ink); padding-bottom: 12px; margin-bottom: 22px; }
  h1 { font-family: Archivo, sans-serif; font-size: 20px; letter-spacing: .12em; text-transform: uppercase; margin: 0; }
  .sub { color: var(--muted); font-size: 13px; margin-top: 4px; }
  section { margin: 0 0 30px; }
  h2 {
    font-family: Archivo, sans-serif; font-size: 12px; letter-spacing: .18em;
    text-transform: uppercase; color: var(--muted); margin: 0 0 10px;
    border-bottom: 1px solid var(--rule); padding-bottom: 6px;
  }
  .card { background: var(--card); border: 1px solid var(--rule); border-radius: 3px; padding: 14px 16px; margin-bottom: 12px; }
  .row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  @media (min-width: 560px) { .row { grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); } }
  .stat { background: var(--card); border: 1px solid var(--rule); border-radius: 3px; padding: 10px 12px; }
  .stat-label { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); font-family: Archivo, sans-serif; }
  .stat-value {
    font-family: Archivo, sans-serif; font-size: 25px; font-weight: 600; line-height: 1.2; margin-top: 2px;
    direction: ltr; unicode-bidi: isolate; text-align: right;
  }
  .stat-sub { font-size: 12px; color: var(--muted); }
  .stat.warn .stat-value { color: var(--oxide); }
  .stat.good .stat-value { color: var(--teal); }
  .chart { width: 100%; height: auto; display: block; }
  .chart text { direction: ltr; unicode-bidi: isolate; }
  .empty { color: var(--muted); font-size: 13px; padding: 18px 0; text-align: center; }
  .strip { display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; }
  .strip-day {
    border: 1px solid var(--rule); border-radius: 3px; padding: 8px 2px; text-align: center; background: var(--card);
  }
  .strip-label { display: block; font-size: 11px; color: var(--muted); }
  .strip-mark { display: block; font-size: 17px; line-height: 1.2; font-weight: 600; }
  .strip-day.done { background: var(--teal); border-color: var(--teal); }
  .strip-day.done .strip-label, .strip-day.done .strip-mark { color: var(--paper); }
  .strip-day.missed { border-color: var(--oxide); }
  .strip-day.missed .strip-mark { color: var(--oxide); }
  .strip-day.rest { opacity: .55; }
  ul { margin: 6px 0; padding-inline-start: 20px; }
  li { margin: 3px 0; }
  .lab-line { display: flex; justify-content: space-between; gap: 10px; border-bottom: 1px solid var(--rule); padding: 7px 0; font-size: 14px; }
  .lab-line:last-child { border-bottom: 0; }
  .up { color: var(--oxide); } .down { color: var(--teal); }
  .hist { max-height: 460px; overflow-y: auto; border: 1px solid var(--rule); border-radius: 3px; background: var(--card); }
  .hist-row { padding: 8px 12px; border-bottom: 1px solid var(--rule); font-size: 13px; }
  .hist-row:last-child { border-bottom: 0; }
  .hist-date { font-family: Archivo, sans-serif; color: var(--muted); font-size: 11px; letter-spacing: .06em; }
  .hist-meta { color: var(--muted); font-size: 12px; }
  input[type=search] {
    width: 100%; padding: 9px 12px; border: 1px solid var(--rule); border-radius: 3px;
    background: var(--card); color: var(--ink); font: inherit; font-size: 14px; margin-bottom: 8px;
  }
  .note { font-size: 12px; color: var(--muted); margin-top: 8px; }
  .banner { border-inline-start: 3px solid var(--oxide); padding: 8px 12px; background: var(--card); margin-bottom: 12px; font-size: 14px; }
  footer { border-top: 1px solid var(--rule); padding-top: 12px; color: var(--muted); font-size: 11px; }
  @media (max-width: 420px) { .stat-value { font-size: 22px; } }
</style>
</head>
<body>
<div class="wrap">
<header>
  <h1>Health OS</h1>
  <div class="sub">${esc(ctx.prettyDate)} · أسبوع ${ctx.week || '—'} من 4 · ${esc(profile.training?.block?.name ?? '')}</div>
</header>

<section>
  <h2>اليوم</h2>
  ${ctx.streak?.broken ? `<div class="banner">فاتتك ${ctx.streak.misses} جلسات متتالية. القاعدة: لا تفوّت مرتين.</div>` : ''}
  ${targets.deficitPaused ? `<div class="banner">العجز متوقف — اليوم ${targets.quitWindow.daysSinceQuit + 1} من 28 بعد الإقلاع. السعرات على الثبات.</div>` : ''}
  <div class="card">
    <strong>${esc(F.sessionLine(ctx.plan))}</strong>
    ${ctx.plan.adjusted.isLiftDay && ctx.plan.strengthExercises.length
      ? `<ul>${ctx.plan.strengthExercises.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`
      : ''}
    <div class="note">${esc(F.recoveryLine(ctx.plan))}</div>
  </div>
  <div class="row">
    ${stat('بروتين', `${F.num(ctx.totals.protein)}`, `من ${targets.protein_g} جم`, ctx.totals.proteinGap > 40 ? 'warn' : 'good')}
    ${stat('سعرات', `${F.num(ctx.totals.kcal)}`, `من ${targets.kcal}`)}
    ${stat('وجبات', String(ctx.totals.meals), ctx.totals.satFatFlags ? `${ctx.totals.satFatFlags} بدهون مشبعة` : '')}
    ${stat('خطوات', ctx.daily?.steps != null ? String(ctx.daily.steps) : '—', ctx.plan.stepsTarget ? `الهدف ${ctx.plan.stepsTarget}` : '')}
  </div>
  <div class="card" style="margin-top:12px">
    <div class="stat-label">المكمّلات</div>
    ${ctx.supplementSchedule.filter((s) => s.slot !== 'as-needed').map(({ slot, items }) =>
      `<div style="font-size:14px">${esc(slot)} — ${esc(items.map((i) => i.name).join('، '))}</div>`).join('')}
    ${ctx.supplementsDue.length ? `<div class="note">المتبقي اليوم: ${esc(ctx.supplementsDue.map((s) => s.name).join('، '))}</div>` : '<div class="note">الكل مؤشَّر ✓</div>'}
  </div>
</section>

<section>
  <h2>هذا الأسبوع</h2>
  ${weekStrip(days)}
  <div class="row" style="margin-top:12px">
    ${stat('جلسات', F.ltr(`${sessionsDone} / ${trainingDays}`), 'من أيام التمرين', sessionsDone >= trainingDays - 1 ? 'good' : 'warn')}
    ${stat('دقائق هوائية', String(aerobicThisWeek), `الهدف ${aerobicTarget}`, aerobicThisWeek >= aerobicTarget ? 'good' : 'warn')}
    ${stat('سلسلة', String(ctx.hitStreak), 'أيام متتالية', ctx.hitStreak > 2 ? 'good' : '')}
  </div>
</section>

${smoke ? `<section>
  <h2>الإقلاع</h2>
  <div class="row">
    ${smoke.beforeQuit
      ? stat('باقي للإقلاع', String(smoke.daysToQuit), `التاريخ ${esc(profile.smoking.quit_date)}`)
      : stat('بدون تدخين', String(smoke.clean), `من ${smoke.days} يوم منذ التاريخ`, smoke.clean === smoke.days ? 'good' : 'warn')}
  </div>
  <div class="note">${esc(profile.smoking?.note ?? '')}</div>
</section>` : ''}

<section>
  <h2>الاتجاهات · 90 يوم</h2>
  <div class="card"><div class="stat-label">الوزن (كجم)</div>
    ${lineChart(series(dailyRows, 'weight_kg'), { decimals: 1, reference: profile.targets?.goal_weight_kg ?? null, referenceLabel: `الهدف ${profile.targets?.goal_weight_kg ?? ''}` })}</div>
  <div class="card"><div class="stat-label">نبض الراحة</div>
    ${lineChart(series(dailyRows, 'resting_hr'), { color: '#A4442F' })}</div>
  <div class="card"><div class="stat-label">النوم (ساعات)</div>
    ${lineChart(series(dailyRows, 'sleep_hours'), { decimals: 1, reference: 7 })}</div>
  <div class="card"><div class="stat-label">دقائق هوائية / يوم</div>
    ${lineChart(aerobicByDay, { reference: 21, referenceLabel: '150 دقيقة/أسبوع' })}</div>
  <div class="card"><div class="stat-label">بروتين / يوم (جم)</div>
    ${lineChart(proteinByDay, { reference: targets.protein_g, referenceLabel: `الهدف ${targets.protein_g}` })}</div>
</section>

<section>
  <h2>التحاليل</h2>
  <div class="card"><div class="stat-label">LDL (mg/dL)</div>
    ${lineChart(labSeries('ldl'), { color: '#A4442F', reference: 190, referenceLabel: '190 — عالٍ جداً', decimals: 0 })}</div>
  <div class="card"><div class="stat-label">الكوليسترول الكلي (mg/dL)</div>
    ${lineChart(labSeries('total_cholesterol'), { reference: 240, referenceLabel: '240 — مرتفع', decimals: 0 })}</div>
  <div class="card">
    ${ctx.labTrends.slice(0, 8).map((t) => `<div class="lab-line">
      <span>${esc(t.label)}</span>
      <span class="${t.worse === true ? 'up' : t.worse === false ? 'down' : ''}">${esc(F.num(t.latest.value_mgdl ?? t.latest.value, 1))} ${esc(t.latest.value_mgdl ? 'mg/dL' : (t.latest.unit ?? ''))}${t.delta != null ? ` (${t.delta > 0 ? '+' : ''}${esc(F.num(t.delta, 1))})` : ''}</span>
    </div>`).join('') || '<div class="empty">لا توجد تحاليل مسجّلة</div>'}
    <div class="note">القراءة اتجاه لا تشخيص. الطبيب هو اللي يقرر معناها.</div>
  </div>
</section>

${scan ? `<section>
  <h2>تركيب الجسم — ${esc(scan.scanned_on)}</h2>
  <div class="row">
    ${stat('الوزن', `${esc(F.num(scan.weight_kg, 1))}`, 'كجم')}
    ${stat('الدهون', `${esc(F.num(scan.body_fat_pct, 1))}%`, `${esc(F.num(scan.body_fat_kg, 1))} كجم`)}
    ${stat('العضل الهيكلي', `${esc(F.num(scan.skeletal_muscle_kg, 1))}`, 'كجم')}
    ${stat('الدهون الحشوية', scan.visceral_level != null ? String(scan.visceral_level) : '—', 'المستوى')}
  </div>
</section>` : ''}

${ctx.openItems.length ? `<section>
  <h2>المعلّق</h2>
  <div class="card"><ul>${ctx.openItems.map((o) => `<li>${esc(o.title)}${o.due_on ? ` — ${esc(o.due_on)}` : ''}</li>`).join('')}</ul></div>
</section>` : ''}

<section>
  <h2>السجل</h2>
  <input type="search" id="q" placeholder="ابحث في الوجبات والتمارين…" autocomplete="off">
  <div class="hist" id="hist"></div>
</section>

<footer>
  هذا النظام لا يقدّم استشارة طبية. يتتبّع ويذكّر ويدرّب على التمرين والتغذية فقط.
  أي شيء يخص التشخيص أو الدواء أو الأعراض يرجع للطبيب.
</footer>
</div>

<script>
const DATA = ${JSON.stringify(history)};
const hist = document.getElementById('hist');
const q = document.getElementById('q');
function render(term) {
  const t = (term || '').trim().toLowerCase();
  const rows = t ? DATA.filter(r => (r.s + ' ' + r.m + ' ' + r.d).toLowerCase().includes(t)) : DATA;
  if (!rows.length) { hist.innerHTML = '<div class="empty">لا نتائج</div>'; return; }
  hist.innerHTML = rows.slice(0, 200).map(r =>
    '<div class="hist-row"><div class="hist-date">' + r.d + ' · ' + r.t + '</div>' +
    '<div>' + escapeHtml(r.s) + '</div>' +
    (r.m ? '<div class="hist-meta">' + escapeHtml(r.m) + '</div>' : '') + '</div>').join('');
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
q.addEventListener('input', e => render(e.target.value));
render('');
</script>
</body>
</html>`;
}
