// The scheduled messages.
//
// Every job composes a deterministic block of facts first and only then asks
// the model for the one human line on top. If the API is down the message
// still goes out with the facts intact - a brief that arrives every day beats
// a better brief that sometimes doesn't.

import { buildContext } from '../coach/context.js';
import * as chat from '../coach/chat.js';
import * as tg from '../channels/telegram.js';
import { sendEmail, emailEnabled } from '../channels/email.js';
import * as repo from '../repo/index.js';
import * as F from '../bot/format.js';
import { addDays, weekStart, daysBetween, minutesOfDay } from '../lib/time.js';
import { weeklyAerobicTarget } from '../domain/program.js';
import { proteinFix } from '../domain/targets.js';

/* ------------------------------------------------------------ the brief --- */

export async function composeBrief(userId, profile, date) {
  const ctx = await buildContext(userId, profile, { date });
  const facts = [
    `☀️ ${ctx.prettyDate} — أسبوع ${ctx.week || '—'} من 4`,
    F.recoveryLine(ctx.plan),
    ctx.daily?.sleep_hours != null ? `نوم ${F.num(ctx.daily.sleep_hours, 1)} ساعة${ctx.daily.resting_hr ? ` · نبض الراحة ${ctx.daily.resting_hr}` : ''}` : '',
    '',
    `الجلسة: ${F.sessionLine(ctx.plan)}`,
    F.exerciseList(ctx.plan),
    ctx.plan.stepsTarget ? `الخطوات: ${ctx.plan.stepsTarget}` : '',
    '',
    `المكمّلات: ${ctx.supplementSchedule.filter((s) => s.slot !== 'as-needed').map(({ slot, items }) => `${slot} ${items.map((i) => i.name).join('، ')}`).join(' | ')}`,
    ctx.smokeFree?.beforeQuit ? `🚭 ${ctx.smokeFree.daysToQuit} يوم لتاريخ الإقلاع.` : '',
    ctx.smokeFree && !ctx.smokeFree.beforeQuit ? `🚭 ${ctx.smokeFree.clean} يوم بدون تدخين.` : '',
  ].filter((l) => l !== '' && l != null).join('\n');

  const focus = await oneFocus(profile, ctx);
  return `${facts}\n\n🎯 ${focus}`;
}

/** The single thing that matters today. AI-written; falls back to a rule. */
async function oneFocus(profile, ctx) {
  const res = await chat.generate(
    profile,
    ctx,
    'اكتب سطر واحد فقط: "التركيز" لليوم. جملة واحدة قصيرة، فعل واحد قابل للتنفيذ، بالعربي. '
    + 'بدون مقدمة وبدون قائمة وبدون تكرار الأرقام اللي فوق. '
    + 'إذا فات يومين تمرين اذكرها بصراحة وأعطه أصغر طريقة للرجوع اليوم.',
    { maxTokens: 220, thinking: true },
  );
  if (res.ok && res.text && !res.text.startsWith('⚠️')) return res.text.split('\n')[0].trim();
  return fallbackFocus(ctx);
}

export function fallbackFocus(ctx) {
  if (ctx.streak?.broken) return 'فاتتك جلستان. القاعدة: لا تفوّت مرتين. اليوم ولو 10 دقائق Zone 2 — المهم تكسر السلسلة.';
  if (ctx.plan?.recovery?.effectiveBand === 'red') return 'التعافي أحمر. لا حديد اليوم — 20 دقيقة مشي هادئ وبس.';
  if (ctx.plan?.recovery?.pct == null) return 'سجّل أرقام الصباح أول شي: log recovery __ sleep __ rhr __';
  if (ctx.streak?.atRisk) return 'فاتت جلسة أمس. اليوم غير قابل للتفاوض.';
  if (ctx.totals?.proteinGap > 60) return 'ابدأ اليوم ببروتين: 30-40 جم في أول وجبة.';
  if (ctx.smokeFree?.beforeQuit && ctx.smokeFree.daysToQuit <= 7) return 'الإقلاع قرب. جهّز اليوم خطوة وحدة من قائمة التحضير.';
  return `نفّذ جلسة اليوم: ${F.sessionLine(ctx.plan)}`;
}

/* ---------------------------------------------------------- weekly review --- */

export async function composeWeekly(userId, profile, date) {
  const start = weekStart(date);
  const end = addDays(start, 6);
  const ctx = await buildContext(userId, profile, { date });

  const [workoutRows, mealRows, dailyRows] = await Promise.all([
    repo.workouts.between(userId, start, end),
    repo.meals.between(userId, start, end),
    repo.dailyLogs.between(userId, start, end),
  ]);

  const completed = workoutRows.filter((w) => w.completed);
  const sessionDays = new Set(completed.map((w) => w.date)).size;
  const aerobic = completed.reduce((a, w) => a + (Number(w.zone2_minutes) || 0), 0);
  const aerobicTarget = weeklyAerobicTarget(ctx.week, profile) ?? 100;

  const daysWithMeals = new Set(mealRows.map((m) => m.date));
  const proteinByDay = [...daysWithMeals].map((d) =>
    mealRows.filter((m) => m.date === d).reduce((a, m) => a + (Number(m.protein_g_est) || 0), 0));
  const avgProtein = proteinByDay.length
    ? Math.round(proteinByDay.reduce((a, b) => a + b, 0) / proteinByDay.length) : null;

  const weights = dailyRows.filter((d) => d.weight_kg != null);
  const weightChange = weights.length >= 2
    ? Math.round((weights[weights.length - 1].weight_kg - weights[0].weight_kg) * 10) / 10 : null;
  const rhrs = dailyRows.filter((d) => d.resting_hr != null).map((d) => d.resting_hr);
  const sleeps = dailyRows.filter((d) => d.sleep_hours != null).map((d) => Number(d.sleep_hours));

  const facts = [
    `📊 مراجعة الأسبوع ${start} → ${end}`,
    `الجلسات: ${sessionDays} من 7`,
    `دقائق Zone 2: ${aerobic} من ${aerobicTarget}`,
    avgProtein != null ? `متوسط البروتين: ${avgProtein} جم/يوم (الهدف ${ctx.targets.protein_g})` : 'متوسط البروتين: ما في وجبات مسجّلة كافية',
    `أيام سُجّل فيها أكل: ${daysWithMeals.size} من 7`,
    weightChange != null ? `الوزن: ${weightChange > 0 ? '+' : ''}${weightChange} كجم` : '',
    rhrs.length ? `متوسط نبض الراحة: ${Math.round(avg(rhrs))}` : '',
    sleeps.length ? `متوسط النوم: ${(avg(sleeps)).toFixed(1)} ساعة` : '',
    ctx.smokeFree && !ctx.smokeFree.beforeQuit ? `🚭 ${ctx.smokeFree.clean} يوم بدون تدخين` : '',
  ].filter(Boolean).join('\n');

  const res = await chat.generate(
    profile, ctx,
    `هذي أرقام الأسبوع:\n${facts}\n\n`
    + 'اكتب فقرتين قصيرتين بالعربي: (1) حكم صريح على الأسبوع — إذا كان سيئاً قلها بوضوح بدون مجاملة، '
    + '(2) تغيير واحد فقط للأسبوع الجاي. لا تكرر الأرقام.',
    { maxTokens: 500, thinking: true },
  );

  const verdict = res.ok && !res.text.startsWith('⚠️')
    ? res.text
    : (sessionDays >= 5 ? 'أسبوع منفّذ. كمّل بنفس الحجم.' : `${sessionDays} جلسات من 7. الأسبوع الجاي: ثبّت يومين غير قابلين للتفاوض.`);

  return `${facts}\n\n${verdict}`;
}

function avg(list) { return list.reduce((a, b) => a + b, 0) / list.length; }

/* ------------------------------------------------------------------ jobs --- */

async function send(userId, kind, text) {
  await tg.sendMessage(text);
  await repo.messages.add(userId, { direction: 'out', kind, body: text });
}

export const JOBS = [
  {
    key: 'morning_brief',
    at: (p) => p.schedule?.morning_brief ?? '07:00',
    async run(userId, profile, date) {
      await send(userId, 'brief', await composeBrief(userId, profile, date));
    },
  },
  {
    key: 'workout_ready',
    at: (p) => p.schedule?.workout_ready ?? '17:00',
    async run(userId, profile, date) {
      const ctx = await buildContext(userId, profile, { date });
      if (!ctx.plan.isTrainingDay) return 'rest day';
      if (ctx.workoutsToday.some((w) => w.completed)) return 'already trained';
      const lines = [
        `${ctx.plan.adjusted.isLiftDay ? '🏋️' : '🚶'} جلسة اليوم: ${F.sessionLine(ctx.plan)}`,
        F.exerciseList(ctx.plan),
        ctx.plan.strengthPrescription && ctx.plan.adjusted.isLiftDay ? `\n${ctx.plan.strengthPrescription}` : '',
        ctx.plan.adjusted.sets ? ctx.plan.adjusted.sets : '',
        ctx.plan.adjusted.zone2 ? `Zone 2 = ${ctx.plan.adjusted.zone2.hrLow}-${ctx.plan.adjusted.zone2.hrHigh} bpm. تقدر تتكلم بالتلفون طوال الجلسة.` : '',
      ].filter(Boolean).join('\n');
      await tg.sendMessage(lines, {
        keyboard: [[
          { text: '✅ خلّصت', callback_data: `done:${ctx.plan.adjusted.isLiftDay ? 'strength' : 'zone2'}` },
        ]],
      });
      await repo.messages.add(userId, { direction: 'out', kind: 'nudge', body: lines });
    },
  },
  {
    key: 'fuel_check',
    at: (p) => p.schedule?.fuel_check ?? '13:00',
    async run(userId, profile, date) {
      const ctx = await buildContext(userId, profile, { date });
      const gap = ctx.totals.proteinGap;
      const head = `🍽️ البروتين إلى الآن: ${F.num(ctx.totals.protein)} من ${ctx.targets.protein_g} جم.`;
      if (!ctx.totals.meals) return send(userId, 'nudge', `${head}\nما سجّلت أي وجبة. أرسل صورة الغداء أو اكتبها.`);
      if (gap <= 0) return send(userId, 'nudge', `${head} ✅`);
      const fix = proteinFix(gap);
      return send(userId, 'nudge', `${head}\nناقصك ${F.num(gap)} جم. أقرب حل: ${fix.text}.`);
    },
  },
  {
    key: 'psyllium',
    at: (p) => p.schedule?.psyllium ?? '16:30',
    async run(userId, profile, date) {
      const ctx = await buildContext(userId, profile, { date });
      const psy = ctx.supplements.find((s) => /psyllium/i.test(s.name));
      if (!psy) return 'no psyllium in the profile';
      if (psy.status === 'pending') return 'psyllium has not arrived yet';
      await tg.sendMessage(
        `🥄 وقت السيليوم — ${psy.dose}، مع كوب ماء كامل.\nلحاله: ساعتين قبل وبعد أي مكمّل أو دواء.`,
        { keyboard: [[{ text: '✅ أخذته', callback_data: `supp:${psy.id}` }]] },
      );
      await repo.messages.add(userId, { direction: 'out', kind: 'nudge', body: 'psyllium reminder' });
    },
  },
  {
    key: 'evening_sweep',
    at: (p) => p.schedule?.evening_sweep ?? '21:00',
    async run(userId, profile, date) {
      const ctx = await buildContext(userId, profile, { date });
      if (!ctx.plan.isTrainingDay) return 'rest day';
      if (ctx.workoutsToday.some((w) => w.completed)) return 'already trained';

      const escalate = ctx.streak.atRisk || ctx.streak.broken || ctx.zeroAerobicRun >= 2;
      const head = ctx.streak.broken
        ? '⛔ هذي ثاني جلسة تفوت ورا بعض. القاعدة الوحيدة في البرنامج: لا تفوّت مرتين.'
        : escalate
          ? '⚠️ أمس فات. اليوم لا.'
          : '⏳ ما تسجّل تمرين اليوم.';
      const offer = ctx.plan.recovery.effectiveBand === 'red'
        ? 'التعافي أحمر — مشي هادئ 15 دقيقة وبس. لا حديد ولا Zone 2.'
        : ctx.plan.adjusted.isLiftDay
          ? 'خيارك الآن: نصف جلسة — تمرينين فقط، مجموعتين. أو 15 دقيقة مشي.'
          : 'خيارك الآن: 10-15 دقيقة Zone 2، أو مشي هادئ بعد العشا.';
      await tg.sendMessage(`${head}\n${offer}`, {
        keyboard: [
          [{ text: '👍 بسوّيها الحين', callback_data: 'intent:now' }],
          [{ text: '🚫 اليوم راح', callback_data: 'intent:skip' }],
        ],
      });
      await repo.messages.add(userId, { direction: 'out', kind: 'nudge', body: head });
    },
  },
  {
    key: 'bedtime',
    at: (p) => p.schedule?.bedtime ?? '21:30',
    async run(userId, profile, date) {
      const ctx = await buildContext(userId, profile, { date });
      const mag = ctx.supplements.find((s) => /magnesium/i.test(s.name));
      const lines = [
        '🌙 بداية التهدئة.',
        mag ? `${mag.timing_slot} — ${mag.name} (${mag.dose}).` : '',
        'هدف إطفاء النور: 23:15. الشاشة بعيدة قبلها بنصف ساعة.',
        ctx.daily?.weight_kg == null ? 'وزن الصباح بكرة قبل الفطور.' : '',
      ].filter(Boolean).join('\n');
      return send(userId, 'nudge', lines);
    },
  },
  {
    key: 'weekly_review',
    at: (p) => p.schedule?.weekly_review?.time ?? '20:00',
    weekday: (p) => p.schedule?.weekly_review?.weekday ?? 7,
    async run(userId, profile, date) {
      const text = await composeWeekly(userId, profile, date);
      await send(userId, 'review', text);
      if (emailEnabled()) await sendEmail(`Weekly review ${date}`, text);
    },
  },
];

/* -------------------------------------------------------------- triggers --- */

/**
 * Event triggers that do not sit on a fixed clock time. Checked every tick;
 * each fires at most once a day via its own job_runs key.
 */
export const TRIGGERS = [
  {
    key: 'trigger_downgrade',
    // Must reach him BEFORE he trains, so it runs as soon as the morning
    // numbers land rather than at a fixed hour.
    async check(userId, profile, ctx) {
      if (ctx.plan.recovery.pct == null) return null;
      if (!ctx.plan.isTrainingDay) return null;
      const band = ctx.plan.recovery.effectiveBand;
      if (band !== 'red') return null;
      return `🔴 التعافي ${ctx.plan.recovery.pct}%${ctx.plan.recovery.sleepDowngrade ? ' والنوم أقل من 6 ساعات' : ''}.\n`
        + `خطة اليوم نزلت: ${F.sessionLine(ctx.plan)}.\n`
        + `لا حديد اليوم. هذا ليس تراجعاً — هذا هو البرنامج.`;
    },
  },
  {
    key: 'trigger_zero_aerobic',
    async check(userId, profile, ctx) {
      if (ctx.zeroAerobicRun < 2) return null;
      if (minutesOfDay(ctx.time) < minutesOfDay('11:00')) return null;
      // On a fresh install every day looks like a zero-aerobic day because
      // nothing has been logged yet. Drift is only meaningful once the block
      // has had time to produce a record.
      if (daysBetween(profile.training.block.start_date, ctx.date) < 2) return null;
      // Never push aerobic work on a red day - the overlay already said walk only,
      // and two nudges that contradict each other get both of them ignored.
      if (ctx.plan.recovery.effectiveBand === 'red') return null;
      return `⚠️ يومين بصفر دقيقة هوائية. هذي بالضبط الطريقة اللي انهار فيها بلوك يونيو.\n`
        + `اليوم: 15 دقيقة Zone 2 على الإليبتكال. مو أكثر.`;
    },
  },
  {
    key: 'trigger_quit_prep',
    async check(userId, profile, ctx) {
      const s = ctx.smokeFree;
      if (!s?.beforeQuit) return null;
      if (s.daysToQuit > 7) return null;
      if (minutesOfDay(ctx.time) < minutesOfDay('19:00')) return null;
      const med = profile.smoking?.medication ?? '';
      return `🚭 ${s.daysToQuit} يوم لتاريخ الإقلاع (${profile.smoking.quit_date}).\n`
        + (s.daysToQuit >= 7 && med ? `${med}\n` : '')
        + `خطوة اليوم: ${quitPrepStep(s.daysToQuit, profile)}`;
    },
  },
  {
    key: 'trigger_appointment',
    async check(userId, profile, ctx) {
      const items = ctx.openItems.filter((o) => o.due_on && daysBetween(ctx.date, o.due_on) === 0);
      if (!items.length) return null;
      if (minutesOfDay(ctx.time) < minutesOfDay('08:00')) return null;
      return `📌 اليوم: ${items.map((i) => i.title).join('، ')}.`;
    },
  },
];

function quitPrepStep(daysToQuit, profile) {
  const steps = {
    // The support route is whatever the profile says it is - it differs by country.
    7: `احجز موعد عيادة الإقلاع. ${profile?.smoking?.support ?? ''}`.trim(),
    6: 'اكتب أقوى ثلاثة محفّزات عندك — الوقت والمكان لكل واحد.',
    5: 'قرّر مع الطبيب موضوع الدواء اليوم، لأن بدايته لازم تكون قبل التاريخ.',
    4: 'نظّف السيارة والمكتب من أي سجاير وولّاعات.',
    3: 'جهّز البديل: علكة نيكوتين أو لصقات، من العيادة مجاناً.',
    2: 'بلّغ شخصين حولك بالتاريخ.',
    1: 'آخر علبة تنتهي الليلة. لا تشتري غيرها.',
    0: 'اليوم هو التاريخ. أول 72 ساعة هي الأصعب — خذها ساعة بساعة.',
  };
  return steps[daysToQuit] ?? 'راجع قائمة التحضير.';
}

export async function runTriggers(userId, profile, ctx, claim) {
  const fired = [];
  for (const t of TRIGGERS) {
    let text = null;
    try { text = await t.check(userId, profile, ctx); } catch (e) {
      console.error(`[trigger ${t.key}]`, e.message);
      continue;
    }
    if (!text) continue;
    if (!(await claim(t.key))) continue;
    await send(userId, 'alert', text);
    fired.push(t.key);
  }
  return fired;
}
