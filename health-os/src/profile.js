import fs from 'node:fs';
import path from 'node:path';

let cached = null;

const REQUIRED = ['user', 'training', 'nutrition', 'smoking', 'guardrails'];

/**
 * Load the profile file. It holds every personal fact the system knows and is
 * deliberately NOT in source control - see README "Privacy". Code must read
 * personal facts from here, never hard-code them.
 */
export function loadProfile(profilePath = process.env.PROFILE_PATH || './config/profile.json') {
  if (cached && cached.__path === profilePath) return cached;

  // On a hosted deployment there is no file to mount and the profile must not
  // be committed, so it arrives as an environment variable instead. Base64 is
  // the usual form because dashboards mangle multi-line JSON.
  const inline = process.env.PROFILE_B64
    ? Buffer.from(process.env.PROFILE_B64, 'base64').toString('utf8')
    : process.env.PROFILE_JSON || null;
  if (inline) {
    const fromEnv = validate(JSON.parse(inline));
    fromEnv.__path = profilePath;
    cached = fromEnv;
    return fromEnv;
  }

  const abs = path.resolve(profilePath);
  if (!fs.existsSync(abs)) {
    throw new Error(
      `Profile not found at ${abs}.\n` +
      `Copy config/profile.example.json to config/profile.json and fill it in. ` +
      `That file is gitignored on purpose.`
    );
  }
  const profile = validate(JSON.parse(fs.readFileSync(abs, 'utf8')));
  profile.__path = profilePath;
  cached = profile;
  return profile;
}

function validate(profile) {
  const missing = REQUIRED.filter((k) => !profile[k]);
  if (missing.length) throw new Error(`Profile is missing required sections: ${missing.join(', ')}`);
  return profile;
}

export function clearProfileCache() { cached = null; }

export function timezoneOf(profile) { return profile.user?.timezone || 'Asia/Riyadh'; }
export function localeOf(profile) { return profile.user?.locale || 'ar-SA'; }

/** Active supplements in schedule order, grouped by slot. */
export function supplementSchedule(profile) {
  const active = (profile.supplements || [])
    .filter((s) => s.status === 'active' || s.status === 'pending')
    .sort((a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100));
  const slots = new Map();
  for (const s of active) {
    const slot = s.timing_slot || 'as-needed';
    if (!slots.has(slot)) slots.set(slot, []);
    slots.get(slot).push(s);
  }
  return [...slots.entries()]
    .sort((a, b) => (a[0] === 'as-needed' ? 1 : b[0] === 'as-needed' ? -1 : a[0].localeCompare(b[0])))
    .map(([slot, items]) => ({ slot, items }));
}

/** Age in whole years on `onDate` ('YYYY-MM-DD'). */
export function ageOn(profile, onDate) {
  const dob = profile.user?.dob;
  if (!dob) return null;
  const [by, bm, bd] = dob.split('-').map(Number);
  const [y, m, d] = onDate.split('-').map(Number);
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age -= 1;
  return age;
}
