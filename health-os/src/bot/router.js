// Telegram update handling. One user, one chat: anything from another chat id
// is dropped without a reply.

import { loadProfile, timezoneOf } from '../profile.js';
import { buildContext } from '../coach/context.js';
import * as chat from '../coach/chat.js';
import * as mealAi from '../coach/meal.js';
import * as tg from '../channels/telegram.js';
import * as repo from '../repo/index.js';
import * as P from './parse.js';
import * as F from './format.js';
import { L, HELP, LANGS } from './strings.js';
import { localDate } from '../lib/time.js';
import { composeBrief, composeWeekly } from '../scheduler/jobs.js';
import { resolveLang, setLang, todayScore } from './lang.js';

const MAX_PHOTO_BYTES = 4_500_000; // the API accepts more, but a phone photo is smaller

export async function handleUpdate(update, { userId }) {
  const profile = loadProfile();
  const lang = await resolveLang(userId, profile);

  if (update.callback_query) return handleCallback(update.callback_query, userId, lang);
  const msg = update.message ?? update.edited_message;
  if (!msg) return;

  const allowed = String(process.env.TELEGRAM_CHAT_ID);
  if (String(msg.chat?.id) !== allowed) {
    console.warn('[bot] dropped update from chat', msg.chat?.id);
    return;
  }

  const tz = timezoneOf(profile);
  const today = localDate(new Date(), tz);
  const args = { profile, userId, today, lang, t: L(lang) };

  try {
    if (msg.photo?.length || isImageDocument(msg.document)) return await handlePhoto(msg, args);
    const text = (msg.text ?? msg.caption ?? '').trim();
    if (!text) return tg.sendMessage(args.t('noText'));
    await repo.messages.add(userId, { direction: 'in', kind: 'chat', body: text });
    return await handleText(text, args);
  } catch (e) {
    console.error('[bot] handler failed', e);
    await repo.messages.add(userId, { direction: 'out', kind: 'error', body: String(e.message) }).catch(() => {});
    return tg.sendMessage(`⚠️ ${args.t('errPrefix')}: ${e.message}`);
  }
}

function isImageDocument(doc) { return Boolean(doc?.mime_type?.startsWith('image/')); }

/* ------------------------------------------------------------------ text --- */

async function handleText(text, a) {
  const { command, args } = P.splitCommand(text);
  // The slash is optional for the logging verbs, because he will not type it.
  // Bare words that take no argument must be the WHOLE message - otherwise
  // "help me understand my LDL" would print the command list instead of
  // reaching the coach.
  const withArgs = text.match(/^(log|meal|food|labs|rescan|quit)\s+([\s\S]+)$/i);
  const alone = text.trim().match(/^(day|week|quit|supps|help|brief|dash|stats|lang)$/i);
  const cmd = command ?? (withArgs ? withArgs[1].toLowerCase() : alone ? alone[1].toLowerCase() : null);
  const rest = command ? args : (withArgs ? withArgs[2].trim() : '');

  switch (cmd) {
    case 'start':
    case 'help':   return tg.sendMessage(HELP[a.lang] ?? HELP.ar);
    case 'lang':   return cmdLang(rest, a);
    case 'day':    return cmdDay(a);
    case 'brief':  return cmdBrief(a);
    case 'week':   return cmdWeek(a);
    case 'stats':  return cmdStats(a);
    case 'meal':   return cmdMeal(rest, a);
    case 'food':   return cmdFood(rest, a);
    case 'log':    return cmdLog(rest, a);
    case 'labs':   return cmdLabs(rest, a);
    case 'rescan': return cmdRescan(rest, a);
    case 'quit':   return cmdQuit(rest, a);
    case 'supps':  return cmdSupps(a);
    case 'dash':   return cmdDash(a);
    default:       return cmdChat(text, a);
  }
}

/* -------------------------------------------------------------- commands --- */

async function cmdLang(rest, { userId, lang }) {
  const asked = String(rest ?? '').trim().toLowerCase().slice(0, 2);
  const next = LANGS.includes(asked) ? asked : (lang === 'ar' ? 'en' : 'ar');
  await setLang(userId, next);
  return tg.sendMessage(`${L(next)('switched')}\n\n${HELP[next]}`);
}

async function cmdDay({ profile, userId, today, lang, t }) {
  const ctx = await buildContext(userId, profile, { date: today, lang });
  const g = await todayScore(userId, profile, today);
  const tg_ = ctx.targets;
  const lines = [
    `📅 ${ctx.prettyDate} — ${t('weekOf', { a: ctx.week || '—', b: 4 })}`,
    F.recoveryLine(lang, ctx.plan),
    `${t('session')}: ${F.sessionLine(lang, ctx.plan)}`,
    F.exerciseList(ctx.plan),
    '',
    F.macroLine(lang, ctx.totals, tg_),
    tg_.deficitPaused ? `⚑ ${t('deficitPaused', { a: tg_.quitWindow.daysSinceQuit + 1, b: 28 })}` : '',
    ctx.totals.proteinGap > 0 ? t('proteinShort', { n: F.num(ctx.totals.proteinGap) }) : `✅ ${t('proteinDone')}`,
    ctx.workoutsToday.length
      ? `${t('workoutWord')}: ${ctx.workoutsToday.map((w) => `${w.type}${w.duration_min ? ` ${w.duration_min}` : ''}`).join(F.listSep(lang))} ✅`
      : (ctx.plan.isTrainingDay ? `⏳ ${t('noWorkoutYet')}` : ''),
    ctx.supplementsDue.length ? `${t('remainingSupps')}: ${ctx.supplementsDue.map((s) => s.name).join(F.listSep(lang))}` : '',
    smokingLine(ctx, t),
    '',
    `⚡ ${t('xpLine', { lvl: g.level.level, xp: g.total, today: g.today?.xp ?? 0 })}`,
  ];
  return tg.sendMessage(lines.filter((l) => l !== '' && l != null).join('\n'));
}

function smokingLine(ctx, t) {
  const s = ctx.smokeFree;
  if (!s) return '';
  return s.beforeQuit ? `🚭 ${t('daysToQuit', { n: s.daysToQuit })}` : `🚭 ${t('smokeFree', { n: s.clean })}`;
}

async function cmdBrief({ profile, userId, today, lang }) {
  await tg.sendChatAction();
  const text = await composeBrief(userId, profile, today, lang);
  await repo.messages.add(userId, { direction: 'out', kind: 'brief', body: text });
  return tg.sendMessage(text);
}

async function cmdWeek({ profile, userId, today, lang }) {
  await tg.sendChatAction();
  const text = await composeWeekly(userId, profile, today, lang);
  await repo.messages.add(userId, { direction: 'out', kind: 'review', body: text });
  return tg.sendMessage(text);
}

async function cmdStats({ profile, userId, today, lang, t }) {
  const g = await todayScore(userId, profile, today);
  const { ACHIEVEMENT_NAMES, XP_NAMES, LEVEL_NAMES } = await import('../dashboard/i18n.js');
  const name = LEVEL_NAMES[lang]?.[g.level.level] ?? '';
  const earned = new Set((g.today?.earned ?? []).map((e) => e.key));

  const lines = [
    `⚡ ${t('level')} ${g.level.level} — ${name}`,
    `${t('xpTotal')}: ${g.total}${g.level.next ? ` · ${g.level.toNext} ${t('toNext')}` : ''}`,
    `${t('xpToday')}: +${g.today?.xp ?? 0}`,
    '',
    `${t('earnedToday')}:`,
    ...(g.today?.earned ?? []).map((e) => `  ✅ ${XP_NAMES[lang][e.key]} +${e.xp}`),
  ];
  const missing = (g.rules ?? []).filter((r) => !earned.has(r.key));
  if (missing.length) {
    lines.push('', `${t('available')}:`, ...missing.map((r) => `  ⬜ ${XP_NAMES[lang][r.key]} +${r.xp}`));
  }
  lines.push('', `${t('badges')}: ${g.unlockedCount} / ${g.achievementCount}`);
  for (const a of g.achievements.filter((x) => x.unlocked)) {
    lines.push(`  🏅 ${ACHIEVEMENT_NAMES[lang][a.id]?.[0] ?? a.id}`);
  }
  return tg.sendMessage(lines.join('\n'));
}

async function cmdMeal(description, a) {
  if (!description) return tg.sendMessage(a.t('mealNeedsText'));
  await tg.sendChatAction();
  const res = await mealAi.fromText(a.profile, description);
  if (!res.ok) return tg.sendMessage(`⚠️ ${res.error}`);
  return saveAndAck(res.estimate, { ...a, photoUrl: null });
}

async function cmdFood(item, a) {
  if (!item) return tg.sendMessage(a.t('foodNeedsText'));
  await tg.sendChatAction();
  const res = await mealAi.fromText(a.profile, item);
  if (!res.ok) return tg.sendMessage(`⚠️ ${res.error}`);
  return tg.sendMessage(`${F.estimateCard(a.lang, res.estimate)}\n\n${a.t('estimateOnly')}`);
}

async function handlePhoto(msg, a) {
  // Telegram sends several sizes; the last is the largest.
  const fileId = msg.photo?.length ? msg.photo[msg.photo.length - 1].file_id : msg.document.file_id;
  await tg.sendChatAction('upload_photo');
  const file = await tg.downloadFile(fileId);
  if (file.bytes > MAX_PHOTO_BYTES) return tg.sendMessage(a.t('photoTooBig'));
  const res = await mealAi.fromPhoto(a.profile, file.base64, file.mediaType, msg.caption ?? '');
  if (!res.ok) return tg.sendMessage(`⚠️ ${res.error}`);
  return saveAndAck(res.estimate, { ...a, photoUrl: `telegram:${fileId}` });
}

async function saveAndAck(est, { profile, userId, today, lang, t, photoUrl }) {
  await repo.meals.add(userId, {
    date: today, description: est.description, photo_url: photoUrl,
    kcal_est: est.kcal_est, protein_g_est: est.protein_g_est, fibre_g_est: est.fibre_g_est,
    sat_fat_flag: est.sat_fat_flag, source: est.source, confidence: est.confidence,
  });
  const ctx = await buildContext(userId, profile, { date: today, lang });
  const tail = ctx.totals.proteinGap > 0
    ? `${F.macroLine(lang, ctx.totals, ctx.targets)} · ${t('proteinShort', { n: F.num(ctx.totals.proteinGap) })}`
    : `${F.macroLine(lang, ctx.totals, ctx.targets)} · ✅ ${t('proteinDone')}`;
  await repo.messages.add(userId, { direction: 'out', kind: 'log', body: est.description });
  return tg.sendMessage(`${F.estimateCard(lang, est)}\n\n${tail}\n\n${t('correctIt')}`);
}

async function cmdLog(rest, a) {
  const { profile, userId, today, lang, t } = a;
  if (!rest) return tg.sendMessage(HELP[lang] ?? HELP.ar);
  const done = [];

  const metrics = P.parseDailyMetrics(rest);
  if (metrics) {
    await repo.dailyLogs.record(userId, today, metrics);
    done.push(Object.entries(metrics).map(([k, v]) => `${F.metricName(lang, k)} ${F.iso(lang, v)}`).join(F.listSep(lang)));
  }

  const weight = P.parseWeight(rest);
  if (weight != null && !metrics?.weight_kg) {
    await repo.dailyLogs.record(userId, today, { weight_kg: weight });
    done.push(`${t('weightWord')} ${F.iso(lang, weight)}`);
  }

  const workout = P.parseWorkout(rest);
  if (workout) {
    await repo.workouts.add(userId, { ...workout, date: today });
    done.push(workout.completed
      ? `${t('workoutWord')} ${workout.type}${workout.duration_min ? ` ${workout.duration_min}` : ''}`
      : `${t('skipRecorded')}: ${workout.skipped_reason}`);
  }

  if (!done.length) {
    await repo.dailyLogs.record(userId, today, { notes: rest });
    done.push(t('noted'));
  }

  await repo.messages.add(userId, { direction: 'out', kind: 'log', body: done.join(' | ') });

  const ctx = await buildContext(userId, profile, { date: today, lang });
  const extras = [];
  if (workout?.completed && ctx.hitStreak > 1) extras.push(`🔥 ${t('streakFire', { n: ctx.hitStreak })}`);
  if (metrics?.recovery_pct != null) {
    extras.push(`${F.recoveryLine(lang, ctx.plan)}\n${t('session')}: ${F.sessionLine(lang, ctx.plan)}`);
  }
  const g = await todayScore(userId, profile, today);
  extras.push(`⚡ +${g.today?.xp ?? 0} · ${t('level')} ${g.level.level}`);

  return tg.sendMessage(`✅ ${t('logged')}: ${done.join(' · ')}\n\n${extras.join('\n')}`);
}

async function cmdLabs(rest, { profile, userId, today, lang, t }) {
  if (!rest) return tg.sendMessage(t('labsExample'));
  const parsed = P.parseLabs(rest, today);
  const stored = [];
  for (const r of parsed.results) {
    if (r.suspect) continue; // never store a number the converter does not trust
    await repo.labs.add(userId, {
      drawn_on: r.drawn_on, marker: r.marker, value: r.value, unit: r.unit ?? '',
      value_mgdl: r.value_mgdl, flag: null,
    });
    stored.push(r.marker);
  }
  const ctx = await buildContext(userId, profile, { date: today, lang });
  const lines = [];
  if (stored.length) lines.push(`✅ ${t('labsStored', { n: stored.length, d: parsed.drawn_on })}`);
  if (parsed.problems.length) {
    lines.push(`⚠️ ${t('labsRejected')}:\n${parsed.problems.map((p) => `• ${p}`).join('\n')}`);
  }
  const relevant = ctx.labTrends.filter((x) => stored.includes(x.marker));
  if (relevant.length) lines.push('', ...relevant.map((x) => F.labLine(lang, x)));
  lines.push('', t('labsDirectional'));
  return tg.sendMessage(lines.join('\n'));
}

async function cmdRescan(rest, { userId, today, lang, t }) {
  const scan = P.parseScan(rest, today);
  if (!scan) return tg.sendMessage(t('scanExample'));
  const prev = await repo.bodyScans.latest(userId);
  await repo.bodyScans.add(userId, scan);
  const lines = [`✅ ${t('scanStored', { d: scan.scanned_on })}`];
  if (prev) {
    const d = (x, y) => (x != null && y != null ? `${x > y ? '+' : ''}${F.num(x - y, 1)}` : '—');
    lines.push(
      t('scanVs', { d: prev.scanned_on }),
      `  ${t('weightLbl')} ${F.iso(lang, d(scan.weight_kg, prev.weight_kg))}`,
      `  ${t('fatLbl')} ${F.iso(lang, d(scan.body_fat_pct, prev.body_fat_pct))} %`,
      `  ${t('muscleLbl')} ${F.iso(lang, d(scan.skeletal_muscle_kg, prev.skeletal_muscle_kg))}`,
    );
  }
  return tg.sendMessage(lines.join('\n'));
}

async function cmdQuit(rest, { profile, userId, today, lang, t }) {
  const parsed = rest ? P.parseSmoking(rest) : null;
  if (parsed) {
    await repo.smoking.add(userId, {
      date: today, cigarettes: parsed.cigarettes, craving_peak: parsed.craving_peak,
      trigger: parsed.trigger, quit_date_active: profile.smoking?.quit_date ?? null,
    });
    if (parsed.cigarettes != null) {
      await repo.dailyLogs.record(userId, today, { smoke_free: parsed.cigarettes === 0 });
    }
  }
  const ctx = await buildContext(userId, profile, { date: today, lang });
  const s = ctx.smokeFree;
  const lines = [];
  if (parsed) lines.push(`✅ ${t('logged')}.`);
  if (!s) lines.push(t('noQuitDate'));
  else if (s.beforeQuit) {
    lines.push(`🚭 ${t('daysToQuit', { n: s.daysToQuit })} (${profile.smoking.quit_date})`);
    lines.push(profile.smoking.support ?? '');
    if (s.daysToQuit <= 14 && profile.smoking?.medication) lines.push(`⚑ ${profile.smoking.medication}`);
  } else {
    lines.push(`🚭 ${t('quitToday', { d: s.days, c: s.clean })}`);
    if (ctx.targets.deficitPaused) lines.push(t('caloriesHold', { n: ctx.targets.quitWindow.daysLeft }));
  }
  if (parsed?.craving_peak != null) {
    await tg.sendChatAction();
    const ask = lang === 'ar'
      ? `سجّلت رغبة شدتها ${parsed.craving_peak}/10${parsed.trigger ? ` والمحفّز: ${parsed.trigger}` : ''}. أعطني ردّ قصير وخطوة واحدة.`
      : `Logged a craving at ${parsed.craving_peak}/10${parsed.trigger ? `, trigger: ${parsed.trigger}` : ''}. Give me one short reply and one step.`;
    const res = await chat.reply(profile, ctx, ask, { lang });
    if (res.ok) lines.push('', res.text);
  }
  return tg.sendMessage(lines.filter(Boolean).join('\n'));
}

async function cmdSupps({ profile, userId, today, lang, t }) {
  const ctx = await buildContext(userId, profile, { date: today, lang });
  const due = ctx.supplements.filter((s) => s.timing_slot && s.timing_slot !== 'as-needed');
  if (!due.length) return tg.sendMessage(t('noSupps'));
  const taken = await repo.supplements.takenOn(userId, today);
  const takenIds = new Set(taken.filter((x) => x.taken).map((x) => x.supplement_id));
  const keyboard = due.map((s) => [{
    text: `${takenIds.has(s.id) ? '✅' : '⬜'} ${s.timing_slot} ${s.name}`,
    callback_data: `supp:${s.id}`,
  }]);
  const psyllium = due.find((s) => /psyllium/i.test(s.name));
  const note = psyllium?.notes ? `\n\n⚠️ ${psyllium.notes}` : '';
  return tg.sendMessage(`${t('suppsToday')}:${note}`, { keyboard });
}

async function cmdDash({ lang, t }) {
  const url = F.dashboardUrl(lang);
  if (!url) return tg.sendMessage(t('dashOff'));
  return tg.sendMessage(`📊 ${t('dashLink')}:\n${url}`);
}

async function cmdChat(text, { profile, userId, today, lang }) {
  await tg.sendChatAction();
  const ctx = await buildContext(userId, profile, { date: today, lang });
  const history = await chat.history(userId, 14);
  const res = await chat.reply(profile, ctx, text, { history: history.slice(0, -1), lang });
  await repo.messages.add(userId, { direction: 'out', kind: 'chat', body: res.text });
  return tg.sendMessage(res.text);
}

/* -------------------------------------------------------------- callback --- */

async function handleCallback(cb, userId, lang) {
  const profile = loadProfile();
  const today = localDate(new Date(), timezoneOf(profile));
  const t = L(lang);
  const data = String(cb.data ?? '');

  if (data.startsWith('supp:')) {
    const id = Number(data.slice(5));
    const taken = await repo.supplements.takenOn(userId, today);
    const already = taken.find((x) => x.supplement_id === id && x.taken);
    await repo.supplements.logTaken(userId, today, id, !already);
    await tg.answerCallbackQuery(cb.id, already ? '↺' : '✅');
    return cmdSupps({ profile, userId, today, lang, t });
  }

  if (data.startsWith('done:')) {
    const type = data.slice(5);
    if (!['zone2', 'strength', 'walk', 'other'].includes(type)) {
      await tg.answerCallbackQuery(cb.id);
      return tg.sendMessage(`⚠️ ${t('unknownButton')}`);
    }
    await repo.workouts.add(userId, { date: today, type, completed: true });
    await tg.answerCallbackQuery(cb.id, '✅');
    const ctx = await buildContext(userId, profile, { date: today, lang });
    const g = await todayScore(userId, profile, today);
    return tg.sendMessage(`✅ ${t('logged')}. ${ctx.hitStreak > 1 ? `🔥 ${t('streakFire', { n: ctx.hitStreak })}` : ''}\n⚡ +${g.today?.xp ?? 0}`);
  }

  // "I'll do it now" is an intention, not a workout. Recording it as one would
  // put a session in the history that never happened.
  if (data === 'intent:now') {
    await tg.answerCallbackQuery(cb.id, '👍');
    return tg.sendMessage(t('intentAck'));
  }

  if (data === 'intent:skip') {
    await repo.workouts.add(userId, {
      date: today, type: 'other', completed: false, skipped_reason: 'declined at the evening sweep',
    });
    await tg.answerCallbackQuery(cb.id, '✓');
    return tg.sendMessage(t('skipAck'));
  }

  return tg.answerCallbackQuery(cb.id);
}
