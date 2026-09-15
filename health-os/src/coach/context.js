// Gathers everything the coach needs to know about right now, in one place,
// so the prompt builder and the scheduled jobs agree on the facts.

import { localParts, addDays, prettyDate } from '../lib/time.js';
import { timezoneOf, localeOf, supplementSchedule } from '../profile.js';
import { planForDay } from '../domain/program.js';
import { targetsFor, dayTotals } from '../domain/targets.js';
import { missStreak, hitStreak, zeroAerobicRun, smokeFreeDays } from '../domain/streaks.js';
import { trends } from '../domain/labs.js';
import * as repo from '../repo/index.js';

const WEEKDAY = {
  ar: { 1: 'الاثنين', 2: 'الثلاثاء', 3: 'الأربعاء', 4: 'الخميس', 5: 'الجمعة', 6: 'السبت', 7: 'الأحد' },
  en: { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday', 7: 'Sunday' },
};

export async function buildContext(userId, profile, { at = new Date(), date = null, lang = null } = {}) {
  const tz = timezoneOf(profile);
  // The date he reads should be in the language he is reading.
  const active = lang ?? localeOf(profile).slice(0, 2);
  const locale = active === 'en' ? 'en-GB' : 'ar-SA';
  const parts = localParts(at, tz);
  const today = date ?? parts.date;

  const [daily, mealsToday, workoutsToday, labRows, suppRows, takenRows, openItemsRows, recentMeals] =
    await Promise.all([
      repo.dailyLogs.forDate(userId, today),
      repo.meals.forDate(userId, today),
      repo.workouts.forDate(userId, today),
      repo.labs.all(userId),
      repo.supplements.active(userId),
      repo.supplements.takenOn(userId, today),
      repo.openItems.open(userId),
      repo.meals.latest(userId, 5),
    ]);

  // Each window must cover everything the helper reading it walks back through,
  // or the streak silently under-reports: hitStreak looks back 60 days, and the
  // smoke-free count walks every day since the quit date.
  const workoutFrom = addDays(today, -90);
  const quit = profile.smoking?.quit_date;
  const smokingFrom = quit && quit < workoutFrom ? quit : workoutFrom;
  const [workoutMap, smokingMap] = await Promise.all([
    repo.workouts.mapBetween(userId, workoutFrom, today),
    repo.smoking.mapBetween(userId, smokingFrom, today),
  ]);

  const plan = planForDay(today, profile, {
    recoveryPct: daily?.recovery_pct ?? null,
    sleepHours: daily?.sleep_hours ?? null,
  });
  const targets = targetsFor(today, profile);
  const totals = dayTotals(mealsToday, targets);

  const takenIds = new Set(takenRows.filter((r) => r.taken).map((r) => r.supplement_id));
  const supplementsDue = suppRows.filter(
    (s) => s.timing_slot && s.timing_slot !== 'as-needed' && !takenIds.has(s.id),
  );

  return {
    userId,
    date: today,
    time: parts.hhmm,
    timezone: tz,
    locale,
    lang: active,
    weekday: parts.weekday,
    weekdayName: (WEEKDAY[active] ?? WEEKDAY.ar)[parts.weekday] ?? parts.weekdayShort,
    prettyDate: prettyDate(today, locale, tz),
    week: plan.week,
    plan,
    targets,
    totals,
    daily,
    mealsToday,
    workoutsToday,
    recentMeals,
    supplements: suppRows,
    supplementSchedule: supplementSchedule(profile),
    supplementsDue,
    openItems: openItemsRows,
    labTrends: trends(labRows, profile.lab_thresholds ?? {}),
    streak: missStreak(today, profile, workoutMap),
    hitStreak: hitStreak(today, profile, workoutMap),
    zeroAerobicRun: zeroAerobicRun(today, workoutMap),
    smokeFree: smokeFreeDays(today, profile, smokingMap),
    workoutMap,
  };
}
