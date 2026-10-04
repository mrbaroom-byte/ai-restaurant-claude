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
import { L } from '../bot/strings.js';
import { todayScore } from '../bot/lang.js';
import { addDays, weekStart, daysBetween, minutesOfDay } from '../lib/time.js';
import { weeklyAerobicTarget } from '../domain/program.js';
import { proteinFix } from '../domain/targets.js';
import * as whoop from '../integrations/whoop/sync.js';

/* ------------------------------------------------------------ the brief --- */

export async function composeBrief(userId, profile, date, lang = 'ar') {
  const t = L(lang);
  // Pull WHOOP first. A webhook usually beats 07:00, but not if he woke at
  // 06:55 - and a brief that says "recovery not logged" when the watch knows
  // the number is the exact friction this integration exists to remove.
  await syncWhoopQuietly(userId, profile);
  const ctx = await buildContext(userId, profile, { date, lang });
  const game = await todayScore(userId, profile, date).catch(() => null);

  const facts = [
    `☀️ ${ctx.prettyDate} — ${t('weekOf', { a: ctx.week || '—', b: 4 })}`,
    F.recoveryLine(lang, ctx.plan),
    ctx.daily?.sleep_hours != null
      ? `${t('sleepLine', { h: F.num(ctx.daily.sleep_hours, 1) })}${ctx.daily.resting_hr ? ` · ${t('restingHr')} ${ctx.daily.resting_hr}` : ''}`
      : '',
    '',
    `${t('session')}: ${F.sessionLine(lang, ctx.plan)}`,
    F.exerciseList(ctx.plan),
    ctx.plan.stepsTarget ? `${t('steps')}: ${ctx.plan.stepsTarget}` : '',
    '',
    `${t('supplements')}: ${ctx.supplementSchedule.filter((s) => s.slot !== 'as-needed')
      .map(({ slot, items }) => `${slot} ${items.map((i) => i.name).join(F.listSep(lang))}`).join(' | ')}`,
    ctx.smokeFree?.beforeQuit ? `🚭 ${t('daysToQuit', { n: ctx.smokeFree.daysToQuit })}` : '',
    ctx.smokeFree && !ctx.smokeFree.beforeQuit ? `🚭 ${t('smokeFree', { n: ctx.smokeFree.clean })}` : '',
    game ? `⚡ ${t('xpLine', { lvl: game.level.level, xp: game.total, today: game.today?.xp ?? 0 })}` : '',
  ].filter((l) => l !== '' && l != null).join('\n');

  const focus = await oneFocus(profile, ctx, lang);
  return `${facts}\n\n🎯 ${focus}`;
}

/** Best-effort: a WHOOP outage must never stop the brief going out. */
async function syncWhoopQuietly(userId, profile) {
  try {
    if (!(await whoop.isConnected(userId))) return;
    await whoop.syncRecent(userId, profile, 2);
  } catch (e) {
    console.warn('[brief] whoop sync skipped:', e.message);
  }
}

/** The single thing that matters today. AI-written; falls back to a rule. */
async function oneFocus(profile, ctx, lang) {
  const instruction = lang === 'en'
    ? 'Write one line only: the focus for today. One short sentence, one actionable verb. '
      + 'No preamble, no list, and do not repeat the numbers above. '
      + 'If two sessions have been missed, say so plainly and give the smallest way back in today.'
    : 'اكتب سطر واحد فقط: "التركيز" لليوم. جملة واحدة قصيرة، فعل واحد قابل للتنفيذ، بالعربي. '
      + 'بدون مقدمة وبدون قائمة وبدون تكرار الأرقام اللي فوق. '
      + 'إذا فات يومين تمرين اذكرها بصراحة وأعطه أصغر طريقة للرجوع اليوم.';
  const res = await chat.generate(profile, ctx, instruction, { maxTokens: 220, thinking: true, lang });
  if (res.ok && res.text && !res.text.startsWith('⚠️')) return res.text.split('\n')[0].trim();
  return fallbackFocus(ctx, lang);
}

export function fallbackFocus(ctx, lang = 'ar') {
  const ar = lang !== 'en';
  if (ctx.streak?.broken) {
    return ar ? 'فاتتك جلستان. القاعدة: لا تفوّت مرتين. اليوم ولو 10 دقائق Zone 2 — المهم تكسر السلسلة.'
              : 'Two sessions missed. The rule is never miss twice. Ten minutes of Zone 2 today is enough to break it.';
  }
  if (ctx.plan?.recovery?.effectiveBand === 'red') {
    return ar ? 'التعافي أحمر. لا حديد اليوم — 20 دقيقة مشي هادئ وبس.'
              : 'Recovery is red. No lifting today — a 20 minute easy walk and nothing more.';
  }
  if (ctx.plan?.recovery?.pct == null) {
    return ar ? 'سجّل أرقام الصباح أول شي: log recovery __ sleep __ rhr __'
              : 'Log the morning numbers first: log recovery __ sleep __ rhr __';
  }
  if (ctx.streak?.atRisk) {
    return ar ? 'فاتت جلسة أمس. اليوم غير قابل للتفاوض.' : 'Yesterday was missed. Today is not negotiable.';
  }
  if (ctx.totals?.proteinGap > 60) {
    return ar ? 'ابدأ اليوم ببروتين: 30-40 جم في أول وجبة.' : 'Start with protein: 30-40 g in the first meal.';
  }
  if (ctx.smokeFree?.beforeQuit && ctx.smokeFree.daysToQuit <= 7) {
    return ar ? 'الإقلاع قرب. جهّز اليوم خطوة وحدة من قائمة التحضير.'
              : 'The quit date is close. Do one prep step today.';
  }
  return `${ar ? 'نفّذ جلسة اليوم' : "Do today's session"}: ${F.sessionLine(lang, ctx.plan)}`;
}

/* ---------------------------------------------------------- weekly review --- */

export async function composeWeekly(userId, profile, date, lang = 'ar') {
  const t = L(lang);
  const start = weekStart(date);
  const end = addDays(start, 6);
  const ctx = await buildContext(userId, profile, { date, lang });
  const game = await todayScore(userId, profile, date).catch(() => null);

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

  const weekXp = game
    ? (game.perDay ?? []).filter((d) => d.date >= start && d.date <= end).reduce((a, d) => a + d.xp, 0)
    : null;

  const facts = [
    `📊 ${t('weeklyTitle', { a: start, b: end })}`,
    t('weeklySessions', { a: sessionDays }),
    t('weeklyAerobic', { a: aerobic, b: aerobicTarget }),
    avgProtein != null
      ? t('weeklyProtein', { a: avgProtein, b: ctx.targets.protein_g })
      : t('weeklyNoMeals'),
    t('weeklyLoggedDays', { a: daysWithMeals.size }),
    weightChange != null ? t('weeklyWeight', { a: `${weightChange > 0 ? '+' : ''}${weightChange}` }) : '',
    rhrs.length ? t('weeklyRhr', { a: Math.round(avg(rhrs)) }) : '',
    sleeps.length ? t('weeklySleep', { a: avg(sleeps).toFixed(1) }) : '',
    ctx.smokeFree && !ctx.smokeFree.beforeQuit ? `🚭 ${t('smokeFree', { n: ctx.smokeFree.clean })}` : '',
    weekXp != null ? `⚡ ${t('weeklyXp', { a: weekXp })}` : '',
  ].filter(Boolean).join('\n');

  const instruction = lang === 'en'
    ? `These are the week's numbers:\n${facts}\n\n`
      + 'Write two short paragraphs: (1) a plain verdict on the week — if it was bad, say so without flattery, '
      + '(2) exactly one change for next week. Do not repeat the numbers.'
    : `هذي أرقام الأسبوع:\n${facts}\n\n`
      + 'اكتب فقرتين قصيرتين بالعربي: (1) حكم صريح على الأسبوع — إذا كان سيئاً قلها بوضوح بدون مجاملة، '
      + '(2) تغيير واحد فقط للأسبوع الجاي. لا تكرر الأرقام.';

  const res = await chat.generate(profile, ctx, instruction, { maxTokens: 500, thinking: true, lang });

  const fallback = sessionDays >= 5
    ? (lang === 'en' ? 'A week that was actually executed. Keep the same size.' : 'أسبوع منفّذ. كمّل بنفس الحجم.')
    : (lang === 'en'
      ? `${sessionDays} sessions of 7. Next week: fix two non-negotiable days.`
      : `${sessionDays} جلسات من 7. الأسبوع الجاي: ثبّت يومين غير قابلين للتفاوض.`);

  const verdict = res.ok && !res.text.startsWith('⚠️') ? res.text : fallback;
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
    async run(userId, profile, date, lang) {
      await send(userId, 'brief', await composeBrief(userId, profile, date, lang));
    },
  },
  {
    key: 'workout_ready',
    at: (p) => p.schedule?.workout_ready ?? '17:00',
    async run(userId, profile, date, lang) {
      const t = L(lang);
      const ctx = await buildContext(userId, profile, { date, lang });
      if (!ctx.plan.isTrainingDay) return 'rest day';
      if (ctx.workoutsToday.some((w) => w.completed)) return 'already trained';
      const z = ctx.plan.adjusted.zone2;
      const lines = [
        `${ctx.plan.adjusted.isLiftDay ? '🏋️' : '🚶'} ${t('sessionToday')}: ${F.sessionLine(lang, ctx.plan)}`,
        F.exerciseList(ctx.plan),
        ctx.plan.strengthPrescription && ctx.plan.adjusted.isLiftDay ? `\n${ctx.plan.strengthPrescription}` : '',
        ctx.plan.adjusted.sets ?? '',
        z ? t('zone2Cue', { lo: z.hrLow, hi: z.hrHigh }) : '',
      ].filter(Boolean).join('\n');
      await tg.sendMessage(lines, {
        keyboard: [[{
          text: `✅ ${t('doneBtn')}`,
          callback_data: `done:${ctx.plan.adjusted.isLiftDay ? 'strength' : 'zone2'}`,
        }]],
      });
      await repo.messages.add(userId, { direction: 'out', kind: 'nudge', body: lines });
    },
  },
  {
    key: 'fuel_check',
    at: (p) => p.schedule?.fuel_check ?? '13:00',
    async run(userId, profile, date, lang) {
      const t = L(lang);
      const ctx = await buildContext(userId, profile, { date, lang });
      const gap = ctx.totals.proteinGap;
      const head = `🍽️ ${t('proteinSoFar', { a: F.num(ctx.totals.protein), b: ctx.targets.protein_g })}`;
      if (!ctx.totals.meals) return send(userId, 'nudge', `${head}\n${t('noMealsYet')}`);
      if (gap <= 0) return send(userId, 'nudge', `${head} ✅`);
      const fix = proteinFix(gap);
      return send(userId, 'nudge',
        `${head}\n${t('proteinShort', { n: F.num(gap) })} ${t('nearestFix')}: ${lang === 'en' ? fix.en : fix.text}.`);
    },
  },
  {
    key: 'psyllium',
    at: (p) => p.schedule?.psyllium ?? '16:30',
    async run(userId, profile, date, lang) {
      const t = L(lang);
      const ctx = await buildContext(userId, profile, { date, lang });
      const psy = ctx.supplements.find((s) => /psyllium/i.test(s.name));
      if (!psy) return 'no psyllium in the profile';
      if (psy.status === 'pending') return 'psyllium has not arrived yet';
      await tg.sendMessage(`🥄 ${t('psylliumTime', { dose: psy.dose })}\n${t('psylliumAlone')}`,
        { keyboard: [[{ text: `✅ ${t('tookIt')}`, callback_data: `supp:${psy.id}` }]] });
      await repo.messages.add(userId, { direction: 'out', kind: 'nudge', body: 'psyllium reminder' });
    },
  },
  {
    key: 'evening_sweep',
    at: (p) => p.schedule?.evening_sweep ?? '21:00',
    async run(userId, profile, date, lang) {
      const t = L(lang);
      const ctx = await buildContext(userId, profile, { date, lang });
      if (!ctx.plan.isTrainingDay) return 'rest day';
      if (ctx.workoutsToday.some((w) => w.completed)) return 'already trained';

      const escalate = ctx.streak.atRisk || ctx.streak.broken || ctx.zeroAerobicRun >= 2;
      const head = ctx.streak.broken ? `⛔ ${t('missedTwice')}`
        : escalate ? `⚠️ ${t('missedOne')}`
        : `⏳ ${t('nothingLogged')}`;
      const offer = ctx.plan.recovery.effectiveBand === 'red' ? t('offerRed')
        : ctx.plan.adjusted.isLiftDay ? t('offerLift')
        : t('offerCardio');
      await tg.sendMessage(`${head}\n${offer}`, {
        keyboard: [
          [{ text: `👍 ${t('willDoIt')}`, callback_data: 'intent:now' }],
          [{ text: `🚫 ${t('dayGone')}`, callback_data: 'intent:skip' }],
        ],
      });
      await repo.messages.add(userId, { direction: 'out', kind: 'nudge', body: head });
    },
  },
  {
    key: 'bedtime',
    at: (p) => p.schedule?.bedtime ?? '21:30',
    async run(userId, profile, date, lang) {
      const t = L(lang);
      const ctx = await buildContext(userId, profile, { date, lang });
      const mag = ctx.supplements.find((s) => /magnesium/i.test(s.name));
      const lines = [
        `🌙 ${t('windDown')}`,
        mag ? `${mag.timing_slot} — ${mag.name} (${mag.dose}).` : '',
        t('lightsOut'),
        ctx.daily?.weight_kg == null ? t('weighTomorrow') : '',
      ].filter(Boolean).join('\n');
      return send(userId, 'nudge', lines);
    },
  },
  {
    key: 'weekly_review',
    at: (p) => p.schedule?.weekly_review?.time ?? '20:00',
    weekday: (p) => p.schedule?.weekly_review?.weekday ?? 7,
    async run(userId, profile, date, lang) {
      const text = await composeWeekly(userId, profile, date, lang);
      await send(userId, 'review', text);
      if (emailEnabled()) await sendEmail(`Weekly review ${date}`, text);
    },
  },
];

/* -------------------------------------------------------------- triggers --- */

/**
 * Event triggers that do not sit on a fixed clock time. Checked periodically;
 * each fires at most once a day via its own job_runs key.
 */
export const TRIGGERS = [
  {
    key: 'trigger_downgrade',
    // Must reach him BEFORE he trains, so it runs as soon as the morning
    // numbers land rather than at a fixed hour.
    async check(userId, profile, ctx, lang) {
      if (ctx.plan.recovery.pct == null) return null;
      if (!ctx.plan.isTrainingDay) return null;
      if (ctx.plan.recovery.effectiveBand !== 'red') return null;
      const t = L(lang);
      const sleepNote = ctx.plan.recovery.sleepDowngrade
        ? (lang === 'en' ? ' and under 6 h of sleep' : ' والنوم أقل من 6 ساعات') : '';
      const head = lang === 'en'
        ? `🔴 Recovery ${ctx.plan.recovery.pct}%${sleepNote}.\nToday steps down: ${F.sessionLine(lang, ctx.plan)}.\n`
          + 'No lifting today. This is not a setback — this is the programme.'
        : `🔴 التعافي ${ctx.plan.recovery.pct}%${sleepNote}.\nخطة اليوم نزلت: ${F.sessionLine(lang, ctx.plan)}.\n`
          + 'لا حديد اليوم. هذا ليس تراجعاً — هذا هو البرنامج.';
      return head;
    },
  },
  {
    key: 'trigger_zero_aerobic',
    async check(userId, profile, ctx, lang) {
      if (ctx.zeroAerobicRun < 2) return null;
      if (minutesOfDay(ctx.time) < minutesOfDay('11:00')) return null;
      // Never push aerobic work on a red day - the overlay already said walk only,
      // and two nudges that contradict each other get both of them ignored.
      if (ctx.plan.recovery.effectiveBand === 'red') return null;
      // On a fresh install every day looks like a zero-aerobic day because
      // nothing has been logged yet. Drift is only meaningful once the block
      // has had time to produce a record.
      if (daysBetween(profile.training.block.start_date, ctx.date) < 2) return null;
      return lang === 'en'
        ? '⚠️ Two days at zero aerobic minutes. This is exactly how the June block came apart.\n'
          + 'Today: 15 minutes of Zone 2 on the elliptical. No more than that.'
        : '⚠️ يومين بصفر دقيقة هوائية. هذي بالضبط الطريقة اللي انهار فيها بلوك يونيو.\n'
          + 'اليوم: 15 دقيقة Zone 2 على الإليبتكال. مو أكثر.';
    },
  },
  {
    key: 'trigger_quit_prep',
    async check(userId, profile, ctx, lang) {
      const s = ctx.smokeFree;
      if (!s?.beforeQuit) return null;
      if (s.daysToQuit > 7) return null;
      if (minutesOfDay(ctx.time) < minutesOfDay('19:00')) return null;
      const t = L(lang);
      const med = profile.smoking?.medication ?? '';
      return `🚭 ${t('daysToQuit', { n: s.daysToQuit })} (${profile.smoking.quit_date})\n`
        + (s.daysToQuit >= 7 && med ? `${med}\n` : '')
        + `${t('todayStep')}: ${quitPrepStep(s.daysToQuit, profile, lang)}`;
    },
  },
  {
    key: 'trigger_appointment',
    async check(userId, profile, ctx, lang) {
      const items = ctx.openItems.filter((o) => o.due_on && daysBetween(ctx.date, o.due_on) === 0);
      if (!items.length) return null;
      if (minutesOfDay(ctx.time) < minutesOfDay('08:00')) return null;
      const label = lang === 'en' ? 'Today' : 'اليوم';
      return `📌 ${label}: ${items.map((i) => i.title).join(F.listSep(lang))}.`;
    },
  },
];

const QUIT_STEPS = {
  ar: {
    7: 'احجز موعد عيادة الإقلاع.',
    6: 'اكتب أقوى ثلاثة محفّزات عندك — الوقت والمكان لكل واحد.',
    5: 'قرّر مع الطبيب موضوع الدواء اليوم، لأن بدايته لازم تكون قبل التاريخ.',
    4: 'نظّف السيارة والمكتب من أي سجاير وولّاعات.',
    3: 'جهّز البديل: علكة نيكوتين أو لصقات.',
    2: 'بلّغ شخصين حولك بالتاريخ.',
    1: 'آخر علبة تنتهي الليلة. لا تشتري غيرها.',
    0: 'اليوم هو التاريخ. أول 72 ساعة هي الأصعب — خذها ساعة بساعة.',
  },
  en: {
    7: 'Book the cessation clinic appointment.',
    6: 'Write down your three strongest triggers — the time and place for each.',
    5: 'Settle the medication question with your doctor today; it has to start before the date.',
    4: 'Clear the car and the office of cigarettes and lighters.',
    3: 'Have the substitute ready: nicotine gum or patches.',
    2: 'Tell two people the date.',
    1: 'The last packet finishes tonight. Do not buy another.',
    0: 'Today is the date. The first 72 hours are the worst — take them hour by hour.',
  },
};

function quitPrepStep(daysToQuit, profile, lang = 'ar') {
  const table = QUIT_STEPS[lang] ?? QUIT_STEPS.ar;
  const step = table[daysToQuit];
  if (!step) return lang === 'en' ? 'Review the prep checklist.' : 'راجع قائمة التحضير.';
  // The support route is whatever the profile says it is - it differs by country.
  if (daysToQuit === 7 && profile?.smoking?.support) return `${step} ${profile.smoking.support}`;
  return step;
}

export async function runTriggers(userId, profile, ctx, claim, lang = 'ar') {
  const fired = [];
  for (const trigger of TRIGGERS) {
    let text = null;
    try { text = await trigger.check(userId, profile, ctx, lang); } catch (e) {
      console.error(`[trigger ${trigger.key}]`, e.message);
      continue;
    }
    if (!text) continue;
    if (!(await claim(trigger.key))) continue;
    await send(userId, 'alert', text);
    fired.push(trigger.key);
  }
  return fired;
}
