// Daily nutrition targets, including the one rule that overrides the deficit.

import { daysBetween } from '../lib/time.js';

export const QUIT_MAINTENANCE_DAYS = 28; // four weeks

/**
 * Targets for one day.
 *
 * The deficit pauses for the first four weeks after the quit date. That
 * conflict is already decided (spec section 16) and is not the coach's to
 * re-litigate: gaining a little weight is cheaper than going back to cigarettes.
 */
export function targetsFor(date, profile) {
  const n = profile.nutrition || {};
  const quitDate = profile.smoking?.quit_date ?? null;

  let quitWindow = null;
  if (quitDate) {
    const since = daysBetween(quitDate, date);
    if (since >= 0 && since < QUIT_MAINTENANCE_DAYS) {
      quitWindow = { daysSinceQuit: since, daysLeft: QUIT_MAINTENANCE_DAYS - since };
    }
  }

  const deficitPaused = Boolean(quitWindow);
  const rawKcal = deficitPaused ? (n.kcal_maintenance ?? 2350) : (n.kcal_target ?? 1850);
  const floor = n.kcal_floor ?? 1500;

  return {
    date,
    protein_g: n.protein_g_target ?? 160,
    protein_g_min: n.protein_g_min ?? 150,
    protein_g_max: n.protein_g_max ?? 170,
    protein_per_meal_g: n.protein_per_meal_g ?? [30, 40],
    kcal: Math.max(rawKcal, floor),
    kcal_floor: floor,
    deficitPaused,
    quitWindow,
    reason: deficitPaused
      ? 'Deficit paused: first four weeks after the quit date run at maintenance.'
      : null,
    soluble_fibre_g: n.soluble_fibre_g ?? [10, 25],
    water_litres: n.water_litres ?? 3,
  };
}

/** Roll up the day's meals against the targets. */
export function dayTotals(meals, targets) {
  const kcal = sum(meals, 'kcal_est');
  const protein = sum(meals, 'protein_g_est');
  const fibre = sum(meals, 'fibre_g_est');
  const satFatFlags = meals.filter((m) => m.sat_fat_flag).length;
  const lowConfidence = meals.filter((m) => m.confidence === 'low').length;
  return {
    meals: meals.length,
    kcal,
    protein,
    fibre,
    satFatFlags,
    lowConfidence,
    proteinGap: Math.max(0, round1((targets.protein_g ?? 0) - protein)),
    kcalRemaining: round0((targets.kcal ?? 0) - kcal),
    proteinPct: targets.protein_g ? Math.round((protein / targets.protein_g) * 100) : null,
  };
}

function sum(rows, key) {
  return round1(rows.reduce((a, r) => a + (Number(r[key]) || 0), 0));
}
function round1(n) { return Math.round(n * 10) / 10; }
function round0(n) { return Math.round(n); }

/**
 * One concrete food to close a protein gap, respecting the hard constraints.
 * Deliberately a short list: the coach names ONE thing, not five.
 */
export const PROTEIN_FIXES = [
  { min: 35, text: 'صدر دجاج مشوي ~150 جم', en: 'Grilled chicken breast ~150 g', protein: 45 },
  { min: 28, text: 'علبة تونة بالماء + بيضتين', en: 'Tin of tuna in water + 2 eggs', protein: 38 },
  { min: 20, text: 'سكوب واي + كوب حليب', en: 'Whey scoop + a glass of milk', protein: 28 },
  { min: 15, text: 'سكوب واي بالماء', en: 'Whey scoop in water', protein: 20 },
  { min: 8,  text: 'كوب زبادي يوناني قليل الدسم', en: 'Low-fat Greek yoghurt', protein: 15 },
  { min: 1,  text: 'بيضتين مسلوقتين', en: '2 boiled eggs', protein: 12 },
];

export function proteinFix(gapGrams) {
  if (!gapGrams || gapGrams <= 0) return null;
  return PROTEIN_FIXES.find((f) => gapGrams >= f.min) ?? PROTEIN_FIXES[PROTEIN_FIXES.length - 1];
}
