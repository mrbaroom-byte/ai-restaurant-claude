#!/usr/bin/env node
// Phase-1 manual entry and local inspection. Everything the bot can do,
// without Telegram - useful before the bot exists and for debugging after.
//
//   node src/cli.js day [date]
//   node src/cli.js log "recovery 55 sleep 7.2 rhr 72"
//   node src/cli.js log "z2 22"
//   node src/cli.js meal "دجاج مشوي مع رز ٢٠٠ جم"
//   node src/cli.js labs "2026-03-04 ldl 4.1 mmol/L, hdl 1.3 mmol/L"
//   node src/cli.js scan "2026-10-12 weight 78.5 fat 26 muscle 32.6"
//   node src/cli.js smoke "craving 8 trigger coffee"
//   node src/cli.js brief | week | trends | tick
//   node src/cli.js dashboard > /tmp/dash.html

import { loadProfile, timezoneOf } from './profile.js';
import { localDate } from './lib/time.js';
import * as repo from './repo/index.js';
import * as P from './bot/parse.js';
import * as F from './bot/format.js';
import { resolveLang } from './bot/lang.js';
import { buildContext } from './coach/context.js';
import { composeBrief, composeWeekly, fallbackFocus } from './scheduler/jobs.js';
import { tick } from './scheduler/index.js';
import { renderDashboard } from './dashboard/render.js';
import * as mealAi from './coach/meal.js';
import { closePool } from './db.js';

const [, , cmd, ...rest] = process.argv;
const arg = rest.join(' ').trim();

async function main() {
  const profile = loadProfile();
  const tz = timezoneOf(profile);
  const today = localDate(new Date(), tz);
  const user = await repo.users.upsertFromProfile(profile);
  const uid = user.id;
  const lang = process.env.HOS_LANG || await resolveLang(uid, profile);

  switch (cmd) {
    case 'day': {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(arg) ? arg : today;
      const ctx = await buildContext(uid, profile, { date });
      console.log(`${ctx.prettyDate}  (week ${ctx.week || '-'} of 4)`);
      console.log(F.recoveryLine(lang, ctx.plan));
      console.log(`session: ${F.sessionLine(lang, ctx.plan)}`);
      if (F.exerciseList(ctx.plan)) console.log(F.exerciseList(ctx.plan));
      console.log(F.macroLine(lang, ctx.totals, ctx.targets));
      if (ctx.targets.deficitPaused) console.log(`! ${ctx.targets.reason}`);
      console.log(`workouts today: ${ctx.workoutsToday.length}, meals: ${ctx.totals.meals}`);
      console.log(`streak: hit ${ctx.hitStreak}, missed ${ctx.streak.misses}, zero-aerobic run ${ctx.zeroAerobicRun}`);
      if (ctx.smokeFree) console.log(`smoking: ${JSON.stringify(ctx.smokeFree)}`);
      break;
    }

    case 'log': {
      const metrics = P.parseDailyMetrics(arg);
      const workout = P.parseWorkout(arg);
      const weight = P.parseWeight(arg);
      let did = false;
      if (metrics) { await repo.dailyLogs.record(uid, today, metrics); console.log('daily:', metrics); did = true; }
      if (weight != null && !metrics?.weight_kg) { await repo.dailyLogs.record(uid, today, { weight_kg: weight }); console.log('weight:', weight); did = true; }
      if (workout) { const w = await repo.workouts.add(uid, { ...workout, date: today }); console.log('workout:', w.id, workout); did = true; }
      if (!did) { await repo.dailyLogs.record(uid, today, { notes: arg }); console.log('note recorded'); }
      break;
    }

    case 'meal': {
      const res = await mealAi.fromText(profile, arg);
      if (!res.ok) { console.error(res.error); process.exitCode = 1; break; }
      const e = res.estimate;
      await repo.meals.add(uid, {
        date: today, description: e.description, kcal_est: e.kcal_est,
        protein_g_est: e.protein_g_est, fibre_g_est: e.fibre_g_est,
        sat_fat_flag: e.sat_fat_flag, source: 'text', confidence: e.confidence,
      });
      console.log(F.estimateCard(lang, e));
      break;
    }

    case 'labs': {
      const parsed = P.parseLabs(arg, today);
      for (const r of parsed.results) {
        if (r.suspect) { console.warn('skipped:', r.reason); continue; }
        await repo.labs.add(uid, { drawn_on: r.drawn_on, marker: r.marker, value: r.value, unit: r.unit ?? '', value_mgdl: r.value_mgdl });
        console.log(`stored ${r.marker} = ${r.value} ${r.unit ?? ''}${r.value_mgdl != null ? ` (${r.value_mgdl} mg/dL)` : ''}`);
      }
      for (const p of parsed.problems) console.warn('!', p);
      break;
    }

    case 'scan': {
      const scan = P.parseScan(arg, today);
      if (!scan) { console.error('could not parse a scan from that'); process.exitCode = 1; break; }
      const row = await repo.bodyScans.add(uid, scan);
      console.log('scan stored', row.id, scan);
      break;
    }

    case 'smoke': {
      const s = P.parseSmoking(arg);
      if (!s) { console.error('could not parse'); process.exitCode = 1; break; }
      await repo.smoking.add(uid, { ...s, date: today, quit_date_active: profile.smoking?.quit_date ?? null });
      console.log('smoking logged', s);
      break;
    }

    case 'brief':   console.log(await composeBrief(uid, profile, today, lang)); break;
    case 'week':    console.log(await composeWeekly(uid, profile, today, lang)); break;

    case 'focus': {
      // The deterministic fallback, so it can be checked without spending a call.
      const ctx = await buildContext(uid, profile, { date: today });
      console.log(fallbackFocus(ctx, lang));
      break;
    }

    case 'trends': {
      const ctx = await buildContext(uid, profile, { date: today });
      for (const x of ctx.labTrends) console.log(F.labLine(lang, x));
      break;
    }

    case 'tick': {
      const out = await tick({ userId: uid, profile });
      console.log(JSON.stringify(out, null, 2));
      break;
    }

    case 'dashboard': process.stdout.write(await renderDashboard(uid, profile, today, { lang })); break;

    default:
      console.log(`usage: node src/cli.js <day|log|meal|labs|scan|smoke|brief|week|focus|trends|tick|dashboard> [args]`);
  }
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(closePool);
