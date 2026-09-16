// Gamification.
//
// The design constraint that shapes everything here: his failure mode is
// programme decay, not lack of effort. So points are paid for DOING WHAT THE
// DAY PRESCRIBED, which on a red-recovery day means walking or resting. There
// is deliberately no reward for a deeper deficit, for weight lost, or for
// training through a red day - that would put the scoreboard in direct
// conflict with the guardrails, and the guardrails win.
//
// Nothing here ever subtracts. A bad day scores zero; it does not go negative.

import { addDays, daysBetween, weekStart } from '../lib/time.js';
import { planForDay } from './program.js';
import { targetsFor, dayTotals } from './targets.js';

/** What a single day can earn, and why. `key` is an i18n lookup, not a sentence. */
export const XP_RULES = [
  { key: 'metrics_logged', xp: 10 },
  { key: 'session_done',   xp: 30 },
  { key: 'rest_respected', xp: 20 },
  { key: 'protein_target', xp: 20 },
  { key: 'meals_logged',   xp: 10 },
  { key: 'sleep_7h',       xp: 10 },
  { key: 'supplements',    xp: 10 },
  { key: 'smoke_free',     xp: 25 },
];

const XP = Object.fromEntries(XP_RULES.map((r) => [r.key, r.xp]));

export const LEVELS = [
  { level: 1, at: 0 },
  { level: 2, at: 300 },
  { level: 3, at: 800 },
  { level: 4, at: 1600 },
  { level: 5, at: 2800 },
  { level: 6, at: 4500 },
  { level: 7, at: 7000 },
];

export function levelFor(totalXp) {
  let current = LEVELS[0];
  for (const l of LEVELS) if (totalXp >= l.at) current = l;
  const next = LEVELS.find((l) => l.at > totalXp) ?? null;
  const span = next ? next.at - current.at : 1;
  const into = totalXp - current.at;
  return {
    level: current.level,
    xp: totalXp,
    floor: current.at,
    next: next ? next.at : null,
    toNext: next ? next.at - totalXp : 0,
    progress: next ? Math.min(1, Math.max(0, into / span)) : 1,
  };
}

/**
 * Score one day from what was actually logged.
 *
 * `day` is { plan, daily, meals, workouts, supplementsTaken, supplementsDue, smoking }.
 * Returns { xp, earned: [{key, xp}], possible }.
 */
export function scoreDay(day, profile) {
  const earned = [];
  const add = (key) => earned.push({ key, xp: XP[key] });

  const { plan, daily, meals = [], workouts = [], smokeFree = null } = day;

  if (daily && (daily.recovery_pct != null || daily.sleep_hours != null || daily.resting_hr != null)) {
    add('metrics_logged');
  }

  const completed = workouts.filter((w) => w.completed);
  const band = plan?.recovery?.effectiveBand ?? null;

  if (plan?.isTrainingDay) {
    if (band === 'red') {
      // The red-day prescription is a walk, or nothing. Either earns the
      // points; lifting anyway earns none of them.
      const lifted = completed.some((w) => w.type === 'strength');
      if (!lifted) add('rest_respected');
    } else if (completed.length) {
      add('session_done');
    }
  } else if (!completed.some((w) => w.type === 'strength')) {
    // A prescribed rest day, taken as a rest day.
    add('rest_respected');
  }

  const targets = targetsFor(day.date, profile);
  const totals = dayTotals(meals, targets);
  if (meals.length >= 3) add('meals_logged');
  if (totals.protein >= (targets.protein_g_min ?? targets.protein_g)) add('protein_target');

  if (daily?.sleep_hours != null && Number(daily.sleep_hours) >= 7) add('sleep_7h');

  if (day.supplementsDue != null && day.supplementsTaken != null
      && day.supplementsDue > 0 && day.supplementsTaken >= day.supplementsDue) {
    add('supplements');
  }

  // Only counts once the quit date has passed - before then there is nothing
  // to be smoke-free from.
  if (smokeFree === true) add('smoke_free');

  return {
    date: day.date,
    xp: earned.reduce((a, e) => a + e.xp, 0),
    earned,
    possible: XP_RULES.reduce((a, r) => a + r.xp, 0),
  };
}

/* ------------------------------------------------------------ achievements --- */

/**
 * Every achievement is a pure predicate over the history. They are recomputed
 * rather than stored, so a correction to the log corrects the badge too.
 *
 * `h` is { profile, date, days, workouts, meals, dailyLogs, labs, scans, smoking, plans }
 */
export const ACHIEVEMENTS = [
  {
    id: 'first_session', icon: 'flag', xp: 25,
    test: (h) => h.workouts.some((w) => w.completed),
  },
  {
    id: 'first_week', icon: 'calendar', xp: 60,
    test: (h) => maxSessionsInAWeek(h) >= 5,
  },
  {
    id: 'aerobic_125', icon: 'heart', xp: 80,
    test: (h) => maxWeekly(h.workouts, 'zone2_minutes') >= 125,
  },
  {
    id: 'zone2_discipline', icon: 'target', xp: 60,
    // Five aerobic sessions actually held inside the calibrated band, which is
    // the thing he historically gets wrong by going too hard.
    test: (h) => {
      const lo = h.profile.training?.zone2?.hr_low ?? 110;
      const hi = h.profile.training?.zone2?.hr_high ?? 125;
      return h.workouts.filter((w) => w.completed && w.type === 'zone2'
        && w.avg_hr != null && w.avg_hr >= lo && w.avg_hr <= hi).length >= 5;
    },
  },
  {
    id: 'both_lifts', icon: 'dumbbell', xp: 50,
    test: (h) => {
      const byWeek = new Map();
      for (const w of h.workouts) {
        if (!w.completed || w.type !== 'strength' || !w.session_label) continue;
        const k = weekStart(w.date);
        if (!byWeek.has(k)) byWeek.set(k, new Set());
        byWeek.get(k).add(w.session_label);
      }
      return [...byWeek.values()].some((s) => s.has('A') && s.has('B'));
    },
  },
  {
    id: 'red_day_respected', icon: 'shield', xp: 40,
    // Explicitly rewarded: backing off on a red day is the hard discipline,
    // not the easy one.
    test: (h) => h.plans.some((p) => p.plan.recovery?.effectiveBand === 'red'
      && !p.workouts.some((w) => w.completed && w.type === 'strength')),
  },
  {
    id: 'protein_week', icon: 'bolt', xp: 70,
    test: (h) => longestRun(h.days, (d) => {
      const t = targetsFor(d, h.profile);
      const m = h.meals.filter((x) => x.date === d);
      return m.length > 0 && dayTotals(m, t).protein >= (t.protein_g_min ?? t.protein_g);
    }) >= 7,
  },
  {
    id: 'logged_14', icon: 'book', xp: 50,
    test: (h) => longestRun(h.days, (d) =>
      h.meals.some((m) => m.date === d) || h.workouts.some((w) => w.date === d)
      || h.dailyLogs.some((l) => l.date === d)) >= 14,
  },
  {
    id: 'streak_7', icon: 'fire', xp: 80,
    test: (h) => (h.hitStreakBest ?? 0) >= 7,
  },
  { id: 'smoke_free_1',  icon: 'leaf', xp: 50,  test: (h) => (h.smokeFreeClean ?? 0) >= 1 },
  { id: 'smoke_free_7',  icon: 'leaf', xp: 120, test: (h) => (h.smokeFreeClean ?? 0) >= 7 },
  { id: 'smoke_free_30', icon: 'leaf', xp: 300, test: (h) => (h.smokeFreeClean ?? 0) >= 30 },
  {
    id: 'labs_logged', icon: 'flask', xp: 40,
    // Entering bloodwork is the act that keeps the primary problem visible.
    test: (h) => new Set(h.labs.map((l) => l.drawn_on)).size >= 2,
  },
  {
    id: 'rescan', icon: 'scale', xp: 40,
    test: (h) => h.scans.length >= 2,
  },
];

export function evaluateAchievements(history) {
  return ACHIEVEMENTS.map((a) => {
    let unlocked = false;
    try { unlocked = Boolean(a.test(history)); } catch { unlocked = false; }
    return { id: a.id, icon: a.icon, xp: a.xp, unlocked };
  });
}

/* ------------------------------------------------------------------ totals --- */

/**
 * The whole scoreboard: per-day XP over the window, achievement bonuses, the
 * level that comes out of it, and today's breakdown.
 */
export function scoreboard(history) {
  const perDay = history.plans.map((p) => scoreDay({
    date: p.date,
    plan: p.plan,
    daily: p.daily,
    meals: history.meals.filter((m) => m.date === p.date),
    workouts: p.workouts,
    supplementsDue: p.supplementsDue,
    supplementsTaken: p.supplementsTaken,
    smokeFree: p.smokeFree,
  }, history.profile));

  const dailyXp = perDay.reduce((a, d) => a + d.xp, 0);
  const achievements = evaluateAchievements(history);
  const achievementXp = achievements.filter((a) => a.unlocked).reduce((a, x) => a + x.xp, 0);
  const total = dailyXp + achievementXp;

  const today = perDay.find((d) => d.date === history.date) ?? null;

  return {
    total,
    dailyXp,
    achievementXp,
    level: levelFor(total),
    today,
    perDay,
    achievements,
    unlockedCount: achievements.filter((a) => a.unlocked).length,
    achievementCount: achievements.length,
  };
}

/* ------------------------------------------------------------------ utils --- */

function longestRun(dates, predicate) {
  let best = 0;
  let run = 0;
  for (const d of dates) {
    if (predicate(d)) { run += 1; best = Math.max(best, run); } else run = 0;
  }
  return best;
}

function maxWeekly(workouts, field) {
  const byWeek = new Map();
  for (const w of workouts) {
    if (!w.completed) continue;
    const k = weekStart(w.date);
    byWeek.set(k, (byWeek.get(k) ?? 0) + (Number(w[field]) || 0));
  }
  return byWeek.size ? Math.max(...byWeek.values()) : 0;
}

function maxSessionsInAWeek(h) {
  const byWeek = new Map();
  for (const w of h.workouts) {
    if (!w.completed) continue;
    const k = weekStart(w.date);
    if (!byWeek.has(k)) byWeek.set(k, new Set());
    byWeek.get(k).add(w.date);
  }
  return byWeek.size ? Math.max(...[...byWeek.values()].map((s) => s.size)) : 0;
}

/** Build the history object the scoreboard needs, from raw rows. */
export function buildHistory({ profile, date, days, dailyLogs, meals, workouts, labs, scans,
                               smokingMap, supplementCounts = new Map(), hitStreakBest = 0,
                               smokeFreeClean = 0 }) {
  const logByDate = new Map(dailyLogs.map((l) => [l.date, l]));
  const workByDate = new Map();
  for (const w of workouts) {
    if (!workByDate.has(w.date)) workByDate.set(w.date, []);
    workByDate.get(w.date).push(w);
  }
  const quit = profile.smoking?.quit_date ?? null;

  const plans = days.map((d) => {
    const daily = logByDate.get(d) ?? null;
    const rows = workByDate.get(d) ?? [];
    const counts = supplementCounts.get(d) ?? { due: 0, taken: 0 };
    let smokeFree = null;
    if (quit && daysBetween(quit, d) >= 0) {
      const smoked = (smokingMap.get(d) ?? []).some((r) => Number(r.cigarettes) > 0);
      // A day after the quit date with nothing logged counts as smoke-free
      // only if the daily log says so - silence is not evidence.
      smokeFree = smoked ? false : (daily?.smoke_free === true ? true : false);
    }
    return {
      date: d,
      daily,
      workouts: rows,
      supplementsDue: counts.due,
      supplementsTaken: counts.taken,
      smokeFree,
      plan: planForDay(d, profile, {
        recoveryPct: daily?.recovery_pct ?? null,
        sleepHours: daily?.sleep_hours ?? null,
      }),
    };
  });

  return { profile, date, days, dailyLogs, meals, workouts, labs, scans, plans,
           hitStreakBest, smokeFreeClean };
}
