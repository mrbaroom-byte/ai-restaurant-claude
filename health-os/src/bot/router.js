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
import { localDate } from '../lib/time.js';
import { composeBrief, composeWeekly } from '../scheduler/jobs.js';

const MAX_PHOTO_BYTES = 4_500_000; // the API accepts more, but a phone photo is smaller

export async function handleUpdate(update, { userId }) {
  if (update.callback_query) return handleCallback(update.callback_query, userId);
  const msg = update.message ?? update.edited_message;
  if (!msg) return;

  const allowed = String(process.env.TELEGRAM_CHAT_ID);
  if (String(msg.chat?.id) !== allowed) {
    console.warn('[bot] dropped update from chat', msg.chat?.id);
    return;
  }

  const profile = loadProfile();
  const tz = timezoneOf(profile);
  const today = localDate(new Date(), tz);

  try {
    if (msg.photo?.length || isImageDocument(msg.document)) {
      return await handlePhoto(msg, { profile, userId, today });
    }
    const text = (msg.text ?? msg.caption ?? '').trim();
    if (!text) return tg.sendMessage('ما وصلني نص. اكتب /help للأوامر.');
    await repo.messages.add(userId, { direction: 'in', kind: 'chat', body: text });
    return await handleText(text, { profile, userId, today });
  } catch (e) {
    console.error('[bot] handler failed', e);
    await repo.messages.add(userId, { direction: 'out', kind: 'error', body: String(e.message) }).catch(() => {});
    return tg.sendMessage(`⚠️ صار خطأ: ${e.message}`);
  }
}

function isImageDocument(doc) {
  return Boolean(doc?.mime_type?.startsWith('image/'));
}

/* ------------------------------------------------------------------ text --- */

async function handleText(text, ctxArgs) {
  const { command, args } = P.splitCommand(text);
  // The slash is optional for the logging verbs, because he will not type it.
  // Bare words that take no argument must be the WHOLE message - otherwise
  // "help me understand my LDL" would print the command list instead of
  // reaching the coach.
  const withArgs = text.match(/^(log|meal|food|labs|rescan|quit)\s+([\s\S]+)$/i);
  const alone = text.trim().match(/^(day|week|quit|supps|help|brief|dash)$/i);
  const cmd = command ?? (withArgs ? withArgs[1].toLowerCase() : alone ? alone[1].toLowerCase() : null);
  const rest = command ? args : (withArgs ? withArgs[2].trim() : '');

  switch (cmd) {
    case 'start':
    case 'help':   return tg.sendMessage(F.HELP);
    case 'day':    return cmdDay(ctxArgs);
    case 'brief':  return cmdBrief(ctxArgs);
    case 'week':   return cmdWeek(ctxArgs);
    case 'meal':   return cmdMeal(rest, ctxArgs);
    case 'food':   return cmdFood(rest, ctxArgs);
    case 'log':    return cmdLog(rest, ctxArgs);
    case 'labs':   return cmdLabs(rest, ctxArgs);
    case 'rescan': return cmdRescan(rest, ctxArgs);
    case 'quit':   return cmdQuit(rest, ctxArgs);
    case 'supps':  return cmdSupps(ctxArgs);
    case 'dash':   return cmdDash();
    default:       return cmdChat(text, ctxArgs);
  }
}

/* -------------------------------------------------------------- commands --- */

async function cmdDay({ profile, userId, today }) {
  const ctx = await buildContext(userId, profile, { date: today });
  const t = ctx.targets;
  const lines = [
    `📅 ${ctx.prettyDate} — أسبوع ${ctx.week || '—'} من 4`,
    F.recoveryLine(ctx.plan),
    `الجلسة: ${F.sessionLine(ctx.plan)}`,
    F.exerciseList(ctx.plan),
    '',
    F.macroLine(ctx.totals, t),
    t.deficitPaused ? `⚑ العجز متوقف — اليوم ${t.quitWindow.daysSinceQuit + 1} من 28 بعد الإقلاع.` : '',
    ctx.totals.proteinGap > 0 ? `ناقصك ${F.num(ctx.totals.proteinGap)} جم بروتين.` : '✅ البروتين مكتمل.',
    ctx.workoutsToday.length
      ? `التمرين: ${ctx.workoutsToday.map((w) => `${w.type}${w.duration_min ? ` ${w.duration_min}د` : ''}`).join('، ')} ✅`
      : (ctx.plan.isTrainingDay ? '⏳ ما سجّلت تمرين اليوم.' : ''),
    ctx.supplementsDue.length ? `المكمّلات المتبقية: ${ctx.supplementsDue.map((s) => s.name).join('، ')}` : '',
    ctx.smokeFree?.beforeQuit ? `🚭 ${ctx.smokeFree.daysToQuit} يوم لتاريخ الإقلاع.` : '',
    ctx.smokeFree && !ctx.smokeFree.beforeQuit ? `🚭 ${ctx.smokeFree.clean} يوم بدون تدخين.` : '',
  ];
  return tg.sendMessage(lines.filter((l) => l !== '' && l != null).join('\n'));
}

async function cmdBrief({ profile, userId, today }) {
  await tg.sendChatAction();
  const text = await composeBrief(userId, profile, today);
  await repo.messages.add(userId, { direction: 'out', kind: 'brief', body: text });
  return tg.sendMessage(text);
}

async function cmdWeek({ profile, userId, today }) {
  await tg.sendChatAction();
  const text = await composeWeekly(userId, profile, today);
  await repo.messages.add(userId, { direction: 'out', kind: 'review', body: text });
  return tg.sendMessage(text);
}

async function cmdMeal(description, { profile, userId, today }) {
  if (!description) return tg.sendMessage('اكتب الوجبة بعد الأمر، أو أرسل صورة.');
  await tg.sendChatAction();
  const res = await mealAi.fromText(profile, description);
  if (!res.ok) return tg.sendMessage(`⚠️ ${res.error}`);
  return saveAndAck(res.estimate, { profile, userId, today, photoUrl: null });
}

async function cmdFood(item, { profile }) {
  if (!item) return tg.sendMessage('اكتب الصنف بعد الأمر.');
  await tg.sendChatAction();
  const res = await mealAi.fromText(profile, item);
  if (!res.ok) return tg.sendMessage(`⚠️ ${res.error}`);
  return tg.sendMessage(`${F.estimateCard(res.estimate)}\n\n(تقدير فقط — ما تسجّل. استخدم /meal للتسجيل.)`);
}

async function handlePhoto(msg, { profile, userId, today }) {
  // Telegram sends several sizes; the last is the largest.
  const fileId = msg.photo?.length ? msg.photo[msg.photo.length - 1].file_id : msg.document.file_id;
  await tg.sendChatAction('upload_photo');
  const file = await tg.downloadFile(fileId);
  if (file.bytes > MAX_PHOTO_BYTES) return tg.sendMessage('الصورة كبيرة. أرسلها بجودة أقل.');
  const res = await mealAi.fromPhoto(profile, file.base64, file.mediaType, msg.caption ?? '');
  if (!res.ok) return tg.sendMessage(`⚠️ ${res.error}`);
  return saveAndAck(res.estimate, { profile, userId, today, photoUrl: `telegram:${fileId}` });
}

async function saveAndAck(est, { profile, userId, today, photoUrl }) {
  await repo.meals.add(userId, {
    date: today,
    description: est.description,
    photo_url: photoUrl,
    kcal_est: est.kcal_est,
    protein_g_est: est.protein_g_est,
    fibre_g_est: est.fibre_g_est,
    sat_fat_flag: est.sat_fat_flag,
    source: est.source,
    confidence: est.confidence,
  });
  const ctx = await buildContext(userId, profile, { date: today });
  const tail = ctx.totals.proteinGap > 0
    ? `اليوم: ${F.macroLine(ctx.totals, ctx.targets)} · ناقصك ${F.num(ctx.totals.proteinGap)} جم بروتين.`
    : `اليوم: ${F.macroLine(ctx.totals, ctx.targets)} · ✅ البروتين مكتمل.`;
  await repo.messages.add(userId, { direction: 'out', kind: 'log', body: est.description });
  return tg.sendMessage(`${F.estimateCard(est)}\n\n${tail}\n\nغلط؟ صحّحه بكلامك وأنا أعدّله.`);
}

async function cmdLog(rest, { profile, userId, today }) {
  if (!rest) return tg.sendMessage(F.HELP);
  const done = [];

  const metrics = P.parseDailyMetrics(rest);
  if (metrics) {
    await repo.dailyLogs.record(userId, today, metrics);
    done.push(Object.entries(metrics).map(([k, v]) => `${F.METRIC_AR[k] ?? k} ${F.ltr(v)}`).join('، '));
  }

  const weight = P.parseWeight(rest);
  if (weight != null && !metrics?.weight_kg) {
    await repo.dailyLogs.record(userId, today, { weight_kg: weight });
    done.push(`وزن ${weight} كجم`);
  }

  const workout = P.parseWorkout(rest);
  if (workout) {
    await repo.workouts.add(userId, { ...workout, date: today });
    done.push(workout.completed
      ? `تمرين ${workout.type}${workout.duration_min ? ` ${workout.duration_min} دقيقة` : ''}`
      : `تخطّي مسجّل: ${workout.skipped_reason}`);
  }

  if (!done.length) {
    await repo.dailyLogs.record(userId, today, { notes: rest });
    done.push('ملاحظة');
  }

  await repo.messages.add(userId, { direction: 'out', kind: 'log', body: done.join(' | ') });

  const ctx = await buildContext(userId, profile, { date: today });
  const extras = [];
  if (workout?.completed && ctx.hitStreak > 1) extras.push(`🔥 ${ctx.hitStreak} أيام تمرين متتالية.`);
  if (metrics?.recovery_pct != null) extras.push(F.recoveryLine(ctx.plan) + `\nالجلسة: ${F.sessionLine(ctx.plan)}`);
  return tg.sendMessage(`✅ سُجّل: ${done.join(' · ')}${extras.length ? `\n\n${extras.join('\n')}` : ''}`);
}

async function cmdLabs(rest, { profile, userId, today }) {
  if (!rest) return tg.sendMessage('مثال:\n/labs 2026-03-04 ldl 4.1 mmol/L, hdl 1.3 mmol/L, hba1c 5.4 %');
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
  const ctx = await buildContext(userId, profile, { date: today });
  const lines = [];
  if (stored.length) lines.push(`✅ سُجّل ${stored.length} مؤشر بتاريخ ${parsed.drawn_on}.`);
  if (parsed.problems.length) lines.push(`⚠️ ما انحفظ:\n${parsed.problems.map((p) => `• ${p}`).join('\n')}`);
  const relevant = ctx.labTrends.filter((t) => stored.includes(t.marker));
  if (relevant.length) lines.push('', ...relevant.map(F.labLine));
  lines.push('', 'القراءة اتجاه لا تشخيص — الطبيب هو اللي يقرر معناها.');
  return tg.sendMessage(lines.join('\n'));
}

async function cmdRescan(rest, { userId, today }) {
  const scan = P.parseScan(rest, today);
  if (!scan) return tg.sendMessage('مثال:\n/rescan 2026-10-12 weight 78.5 fat 26 muscle 32.6 visceral 9 whr 1.01');
  const prev = await repo.bodyScans.latest(userId);
  await repo.bodyScans.add(userId, scan);
  const lines = [`✅ InBody ${scan.scanned_on} سُجّل.`];
  if (prev) {
    const d = (a, b) => (a != null && b != null ? `${a > b ? '+' : ''}${F.num(a - b, 1)}` : '—');
    lines.push(
      `مقابل ${prev.scanned_on}:`,
      `  الوزن ${d(scan.weight_kg, prev.weight_kg)} كجم`,
      `  الدهون ${d(scan.body_fat_pct, prev.body_fat_pct)} %`,
      `  العضل ${d(scan.skeletal_muscle_kg, prev.skeletal_muscle_kg)} كجم`,
    );
  }
  return tg.sendMessage(lines.join('\n'));
}

async function cmdQuit(rest, { profile, userId, today }) {
  const parsed = rest ? P.parseSmoking(rest) : null;
  if (parsed) {
    await repo.smoking.add(userId, {
      date: today,
      cigarettes: parsed.cigarettes,
      craving_peak: parsed.craving_peak,
      trigger: parsed.trigger,
      quit_date_active: profile.smoking?.quit_date ?? null,
    });
    if (parsed.cigarettes != null) {
      await repo.dailyLogs.record(userId, today, { smoke_free: parsed.cigarettes === 0 });
    }
  }
  const ctx = await buildContext(userId, profile, { date: today });
  const s = ctx.smokeFree;
  const lines = [];
  if (parsed) lines.push('✅ سُجّل.');
  if (!s) lines.push('ما في تاريخ إقلاع محدد في الملف.');
  else if (s.beforeQuit) {
    lines.push(`🚭 ${s.daysToQuit} يوم لتاريخ الإقلاع (${profile.smoking.quit_date}).`);
    lines.push(profile.smoking.support ?? '');
    if (s.daysToQuit <= 14 && profile.smoking?.medication) lines.push(`⚑ ${profile.smoking.medication}`);
  } else {
    lines.push(`🚭 اليوم ${s.days} بعد تاريخ الإقلاع · ${s.clean} يوم متواصل بدون تدخين.`);
    if (ctx.targets.deficitPaused) lines.push(`السعرات على الثبات هذي الفترة — ${ctx.targets.quitWindow.daysLeft} يوم باقي. الميزان ما يرجّعك للسجائر.`);
  }
  if (parsed?.craving_peak != null) {
    await tg.sendChatAction();
    const res = await chat.reply(profile, ctx, `سجّلت رغبة شدتها ${parsed.craving_peak}/10${parsed.trigger ? ` والمحفّز: ${parsed.trigger}` : ''}. أعطني ردّ قصير وخطوة واحدة.`);
    if (res.ok) lines.push('', res.text);
  }
  return tg.sendMessage(lines.filter(Boolean).join('\n'));
}

async function cmdSupps({ profile, userId, today }) {
  const ctx = await buildContext(userId, profile, { date: today });
  const due = ctx.supplements.filter((s) => s.timing_slot && s.timing_slot !== 'as-needed');
  if (!due.length) return tg.sendMessage('ما في مكمّلات مجدولة.');
  const taken = await repo.supplements.takenOn(userId, today);
  const takenIds = new Set(taken.filter((t) => t.taken).map((t) => t.supplement_id));
  const keyboard = due.map((s) => [{
    text: `${takenIds.has(s.id) ? '✅' : '⬜'} ${s.timing_slot} ${s.name}`,
    callback_data: `supp:${s.id}`,
  }]);
  const psyllium = due.find((s) => /psyllium/i.test(s.name));
  const note = psyllium ? `\n\n⚠️ ${psyllium.notes ?? ''}` : '';
  return tg.sendMessage(`المكمّلات اليوم:${note}`, { keyboard });
}

async function cmdDash() {
  const url = F.dashboardUrl();
  if (!url) return tg.sendMessage('اللوحة غير مفعّلة — ناقص PUBLIC_BASE_URL أو DASHBOARD_TOKEN.');
  return tg.sendMessage(`📊 اللوحة:\n${url}`);
}

async function cmdChat(text, { profile, userId, today }) {
  await tg.sendChatAction();
  const ctx = await buildContext(userId, profile, { date: today });
  const history = await chat.history(userId, 14);
  const res = await chat.reply(profile, ctx, text, { history: history.slice(0, -1) });
  await repo.messages.add(userId, { direction: 'out', kind: 'chat', body: res.text });
  return tg.sendMessage(res.text);
}

/* -------------------------------------------------------------- callback --- */

async function handleCallback(cb, userId) {
  const profile = loadProfile();
  const today = localDate(new Date(), timezoneOf(profile));
  const data = String(cb.data ?? '');

  if (data.startsWith('supp:')) {
    const id = Number(data.slice(5));
    const taken = await repo.supplements.takenOn(userId, today);
    const already = taken.find((t) => t.supplement_id === id && t.taken);
    await repo.supplements.logTaken(userId, today, id, !already);
    await tg.answerCallbackQuery(cb.id, already ? 'أُلغي' : 'تم ✅');
    return cmdSupps({ profile, userId, today });
  }

  if (data.startsWith('done:')) {
    const type = data.slice(5);
    if (!['zone2', 'strength', 'walk', 'other'].includes(type)) {
      await tg.answerCallbackQuery(cb.id);
      return tg.sendMessage('⚠️ زر غير معروف.');
    }
    await repo.workouts.add(userId, { date: today, type, completed: true });
    await tg.answerCallbackQuery(cb.id, 'تم ✅');
    const ctx = await buildContext(userId, profile, { date: today });
    return tg.sendMessage(`✅ سُجّل. ${ctx.hitStreak > 1 ? `🔥 ${ctx.hitStreak} أيام متتالية.` : ''}`);
  }

  // "I'll do it now" is an intention, not a workout. Recording it as one would
  // put a session in the history that never happened.
  if (data === 'intent:now') {
    await tg.answerCallbackQuery(cb.id, 'تمام');
    return tg.sendMessage('تمام. سجّلها لما تخلص: log walk 15');
  }

  if (data === 'intent:skip') {
    await repo.workouts.add(userId, {
      date: today, type: 'other', completed: false, skipped_reason: 'declined at the evening sweep',
    });
    await tg.answerCallbackQuery(cb.id, 'سُجّل');
    return tg.sendMessage('سُجّل كتخطّي. بكرة غير قابل للتفاوض.');
  }

  return tg.answerCallbackQuery(cb.id);
}
