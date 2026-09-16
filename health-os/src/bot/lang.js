// Language preference and the scoreboard lookup the bot needs.
// Separate from the router so the scheduler can use them without importing it.

import * as repo from '../repo/index.js';
import { LANGS } from './strings.js';
import { buildDashboardData } from '../dashboard/data.js';
import { XP_RULES } from '../domain/gamification.js';

/** Stored preference, falling back to the profile's locale. */
export async function resolveLang(userId, profile) {
  try {
    const stored = await repo.settings.get(userId, 'lang', null);
    if (LANGS.includes(stored)) return stored;
  } catch { /* the bot must still answer if settings are unreadable */ }
  const locale = (profile.user?.locale ?? 'ar-SA').slice(0, 2);
  return LANGS.includes(locale) ? locale : 'ar';
}

export async function setLang(userId, lang) {
  return repo.settings.set(userId, 'lang', lang);
}

/** Today's scoreboard, with the rule list attached for the /stats breakdown. */
export async function todayScore(userId, profile, today) {
  const data = await buildDashboardData(userId, profile, today);
  return { ...data.game, rules: XP_RULES };
}
