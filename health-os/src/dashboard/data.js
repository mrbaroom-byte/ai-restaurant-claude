// The dashboard payload.
//
// Deliberately language-neutral: keys, numbers and dates, never a rendered
// sentence. The client holds both string tables, so switching language is a
// re-render rather than a round trip - and there is only one copy of the data.

import { addDays, dateRange, weekStart, weekdayOf, daysBetween } from '../lib/time.js';
import { planForDay, weeklyAerobicTarget } from '../domain/program.js';
import { targetsFor, dayTotals } from '../domain/targets.js';
import { hitStreak } from '../domain/streaks.js';
import { buildContext } from '../coach/context.js';
import { buildHistory, scoreboard } from '../domain/gamification.js';
import * as repo from '../repo/index.js';

const TREND_DAYS = 90;

export async function buildDashboardData(userId, profile, today) {
  const ctx = await buildContext(userId, profile, { date: today });

  const wkStart = weekStart(today);
  const wkEnd = addDays(wkStart, 6);
  const histFrom = addDays(today, -(TREND_DAYS - 1));

  const [dailyRows, mealRows, workoutRows, labRows, scans, suppLogRows] = await Promise.all([
    repo.dailyLogs.between(userId, histFrom, today),
    repo.meals.between(userId, histFrom, today),
    repo.workouts.between(userId, histFrom, today),
    repo.labs.all(userId),
    repo.bodyScans.all(userId),
    repo.supplements.takenOn(userId, today),
  ]);

  const days = dateRange(histFrom, today);

  /* ---- this week ---- */
  const doneDates = new Set(workoutRows.filter((w) => w.completed && w.date >= wkStart).map((w) => w.date));
  const weekDays = dateRange(wkStart, wkEnd).map((d) => {
    const plan = planForDay(d, profile);
    let state = 'planned';
    if (!plan.isTrainingDay) state = 'rest';
    else if (doneDates.has(d)) state = 'done';
    else if (d < today) state = 'missed';
    else if (d === today) state = 'today';
    return { date: d, weekday: weekdayOf(d), state };
  });
  const aerobicThisWeek = workoutRows
    .filter((w) => w.date >= wkStart && w.date <= wkEnd)
    .reduce((a, w) => a + (Number(w.zone2_minutes) || 0), 0);

  /* ---- gamification ---- */
  // Supplement counts are only known for today; earlier days score without
  // that rule rather than guessing at it.
  const supplementCounts = new Map([[today, {
    due: ctx.supplements.filter((s) => s.timing_slot && s.timing_slot !== 'as-needed').length,
    taken: suppLogRows.filter((r) => r.taken).length,
  }]]);

  const history = buildHistory({
    profile, date: today, days,
    dailyLogs: dailyRows, meals: mealRows, workouts: workoutRows,
    labs: labRows, scans, smokingMap: new Map(),
    supplementCounts,
    hitStreakBest: bestHitStreak(days, profile, workoutRows),
    smokeFreeClean: ctx.smokeFree?.clean ?? 0,
  });
  const game = scoreboard(history);

  /* ---- trends ---- */
  const series = (key) => dailyRows.filter((r) => r[key] != null)
    .map((r) => ({ x: r.date, y: Number(r[key]) }));

  const proteinByDay = [];
  const aerobicByDay = [];
  for (const d of days) {
    const dayMeals = mealRows.filter((m) => m.date === d);
    if (dayMeals.length) proteinByDay.push({ x: d, y: dayTotals(dayMeals, targetsFor(d, profile)).protein });
    aerobicByDay.push({
      x: d,
      y: workoutRows.filter((w) => w.date === d).reduce((a, w) => a + (Number(w.zone2_minutes) || 0), 0),
    });
  }

  const labSeries = (marker) => (ctx.labTrends.find((t) => t.marker === marker)?.history ?? [])
    .slice().sort((a, b) => String(a.drawn_on).localeCompare(String(b.drawn_on)))
    .map((r) => ({ x: r.drawn_on, y: Number(r.value_mgdl ?? r.value) }));

  /* ---- history feed ---- */
  const feed = [
    ...mealRows.map((m) => ({
      d: m.date, t: 'meal', s: m.description,
      kcal: m.kcal_est, protein: m.protein_g_est, satFat: m.sat_fat_flag, conf: m.confidence,
    })),
    ...workoutRows.map((w) => ({
      d: w.date, t: 'workout', s: `${w.type}${w.session_label ? ` ${w.session_label}` : ''}`,
      completed: w.completed, duration: w.duration_min, z2: w.zone2_minutes,
      avgHr: w.avg_hr, rpe: w.rpe, reason: w.skipped_reason,
    })),
  ].sort((a, b) => b.d.localeCompare(a.d)).slice(0, 400);

  const t = ctx.targets;
  const plan = ctx.plan;

  return {
    generatedAt: new Date().toISOString(),
    date: today,
    timezone: ctx.timezone,
    weekday: ctx.weekday,
    week: ctx.week,
    blockWeeks: (profile.training?.progression ?? []).length || 4,
    blockName: profile.training?.block?.name ?? null,
    goalWeight: profile.targets?.goal_weight_kg ?? null,

    today: {
      plan: {
        parts: plan.planned,
        isTrainingDay: plan.isTrainingDay,
        isLiftDay: plan.adjusted.isLiftDay,
        strengthLabel: plan.strengthLabel,
        exercises: plan.adjusted.isLiftDay ? plan.strengthExercises : [],
        prescription: plan.strengthPrescription,
        zone2: plan.adjusted.zone2
          ? { min: plan.adjusted.zone2.minutes, max: plan.adjusted.zone2.maxMinutes,
              hrLow: plan.adjusted.zone2.hrLow, hrHigh: plan.adjusted.zone2.hrHigh }
          : null,
        walk: plan.adjusted.walkLong ? { minutes: plan.adjusted.walkMinutes ?? null } : null,
        deferred: plan.adjusted.strengthDeferred ?? null,
        stepsTarget: plan.stepsTarget,
      },
      recovery: {
        pct: plan.recovery.pct,
        band: plan.recovery.band,
        effectiveBand: plan.recovery.effectiveBand,
        sleepDowngrade: plan.recovery.sleepDowngrade,
        readiness: plan.readiness,
      },
      totals: ctx.totals,
      targets: {
        kcal: t.kcal, protein: t.protein_g, proteinMin: t.protein_g_min,
        deficitPaused: t.deficitPaused,
        quitWindow: t.quitWindow,
      },
      metrics: ctx.daily
        ? { weight: ctx.daily.weight_kg, sleep: ctx.daily.sleep_hours,
            restingHr: ctx.daily.resting_hr, steps: ctx.daily.steps }
        : {},
      supplements: ctx.supplementSchedule
        .filter((s) => s.slot !== 'as-needed')
        .map(({ slot, items }) => ({ slot, names: items.map((i) => i.name) })),
      supplementsDue: ctx.supplementsDue.map((s) => s.name),
    },

    streak: {
      misses: ctx.streak.misses,
      broken: ctx.streak.broken,
      atRisk: ctx.streak.atRisk,
      hit: ctx.hitStreak,
    },

    game: {
      total: game.total,
      level: game.level,
      today: game.today,
      achievements: game.achievements,
      unlockedCount: game.unlockedCount,
      achievementCount: game.achievementCount,
    },

    weekView: {
      start: wkStart,
      end: wkEnd,
      days: weekDays,
      sessionsDone: weekDays.filter((d) => d.state === 'done').length,
      trainingDays: weekDays.filter((d) => d.state !== 'rest').length,
      aerobic: aerobicThisWeek,
      aerobicTarget: weeklyAerobicTarget(ctx.week, profile) ?? 125,
    },

    smoking: ctx.smokeFree
      ? { ...ctx.smokeFree, quitDate: profile.smoking?.quit_date ?? null }
      : null,

    trends: {
      weight: series('weight_kg'),
      restingHr: series('resting_hr'),
      sleep: series('sleep_hours'),
      aerobic: aerobicByDay,
      protein: proteinByDay,
    },

    labs: {
      ldl: labSeries('ldl'),
      totalCholesterol: labSeries('total_cholesterol'),
      rows: ctx.labTrends.slice(0, 10).map((tr) => ({
        marker: tr.marker,
        label: tr.label,
        value: tr.latest.value_mgdl ?? tr.latest.value,
        unit: tr.latest.value_mgdl ? 'mg/dL' : (tr.latest.unit ?? ''),
        drawnOn: tr.latest.drawn_on,
        delta: tr.delta,
        direction: tr.direction,
        worse: tr.worse,
        band: tr.band?.flag ?? null,
      })),
    },

    scan: scans[0]
      ? { date: scans[0].scanned_on, weight: scans[0].weight_kg,
          bodyFatPct: scans[0].body_fat_pct, bodyFatKg: scans[0].body_fat_kg,
          muscle: scans[0].skeletal_muscle_kg, visceral: scans[0].visceral_level }
      : null,

    openItems: ctx.openItems.map((o) => ({ title: o.title, dueOn: o.due_on })),
    feed,
  };
}

function bestHitStreak(days, profile, workouts) {
  const byDate = new Map();
  for (const w of workouts) {
    if (!byDate.has(w.date)) byDate.set(w.date, []);
    byDate.get(w.date).push(w);
  }
  let best = 0;
  for (const d of days) best = Math.max(best, hitStreak(d, profile, byDate));
  return best;
}
