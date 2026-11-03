// Pulling WHOOP data in and turning it into rows.
//
// Everything here is idempotent. WHOOP re-sends `updated` events whenever it
// rescores an activity, and a backfill overlaps whatever is already stored, so
// importing the same object twice must be a no-op - or, when the numbers
// genuinely changed, an append-only correction.

import * as repo from '../../repo/index.js';
import { timezoneOf } from '../../profile.js';
import { addDays, localDate } from '../../lib/time.js';
import { createClient, isConfigured } from './api.js';
import { mapWorkout, mapRecovery, withZoneConfig } from './map.js';

export const PROVIDER = 'whoop';
export const ZONE_SETTING = 'whoop_zone';

/** The profile as this user has actually configured it, zones included. */
export async function effectiveProfile(userId, profile) {
  const override = await repo.settings.get(userId, ZONE_SETTING, null);
  return withZoneConfig(profile, override);
}

export async function setZoneCalibration(userId, profile, calibrated) {
  const z = profile.training?.zone2 ?? {};
  const value = calibrated
    ? { calibrated: true, index: 2, low: z.hr_low ?? 110, high: z.hr_high ?? 125, setAt: new Date().toISOString() }
    : { calibrated: false };
  await repo.settings.set(userId, ZONE_SETTING, value);
  return value;
}

export async function zoneCalibration(userId, profile) {
  const stored = await repo.settings.get(userId, ZONE_SETTING, null);
  const z = profile.training?.zone2 ?? {};
  return {
    calibrated: Boolean(stored?.calibrated ?? z.whoop_zone?.calibrated),
    low: z.hr_low ?? 110,
    high: z.hr_high ?? 125,
    setAt: stored?.setAt ?? null,
  };
}

/* ------------------------------------------------------------ connection --- */

/** Token store backed by the integrations table. Refresh tokens rotate, so the
 *  new pair is written before the next request goes out. */
export function tokenStore(userId) {
  return {
    async get() {
      const row = await repo.integrations.get(userId, PROVIDER);
      if (!row || row.status === 'revoked') return null;
      return {
        access_token: row.access_token,
        refresh_token: row.refresh_token,
        expires_at: row.expires_at,
      };
    },
    async save(tokens) {
      await repo.integrations.save(userId, PROVIDER, tokens);
    },
  };
}

export function clientFor(userId, opts = {}) {
  return createClient(tokenStore(userId), opts);
}

export async function isConnected(userId) {
  const row = await repo.integrations.get(userId, PROVIDER);
  return Boolean(row && row.status === 'connected' && row.access_token);
}

export async function connect(userId, tokens) {
  await repo.integrations.save(userId, PROVIDER, tokens);
  // Record who this actually is, so a reconnection to a different account is
  // visible rather than silently mixing two people's data.
  try {
    const me = await clientFor(userId).profile();
    if (me?.user_id) {
      await repo.integrations.save(userId, PROVIDER, { ...tokens, external_user: String(me.user_id) });
    }
    return me;
  } catch (e) {
    await repo.integrations.fail(userId, PROVIDER, 'error', e.message);
    throw e;
  }
}

export async function status(userId) {
  const row = await repo.integrations.get(userId, PROVIDER);
  if (!row) return { configured: isConfigured(), connected: false };
  return {
    configured: isConfigured(),
    connected: row.status === 'connected' && Boolean(row.access_token),
    status: row.status,
    externalUser: row.external_user,
    scopes: row.scopes,
    lastSyncAt: row.last_sync_at,
    lastError: row.last_error,
  };
}

/* ------------------------------------------------------------------ sync --- */

const iso = (d) => new Date(d).toISOString();

/**
 * Pull everything in a window and write it.
 *
 * Recoveries and sleeps are fetched together and joined on `sleep_id`, because
 * a recovery alone carries no timestamp that reliably identifies the morning it
 * belongs to - the sleep's end does.
 */
export async function syncRange(userId, rawProfile, { start, end, max = 500, client = null } = {}) {
  const api = client ?? clientFor(userId);
  const profile = await effectiveProfile(userId, rawProfile);
  const tz = timezoneOf(profile);
  const range = { start: iso(start), end: iso(end) };

  const [recoveries, sleeps, workouts] = await Promise.all([
    api.recoveries(range).catch(wrap('recovery')),
    api.sleeps(range).catch(wrap('sleep')),
    api.workouts(range).catch(wrap('workout')),
  ]);

  const sleepById = new Map((sleeps ?? []).map((s) => [String(s.id), s]));
  const result = { recoveries: 0, sleeps: 0, workouts: 0, corrected: 0, warnings: [], dates: new Set() };

  // Recovery carries the morning numbers; the sleep it points at carries the
  // hours. One row per morning, merged.
  for (const rec of recoveries ?? []) {
    const sleepRow = sleepById.get(String(rec.sleep_id)) ?? null;
    const mapped = mapRecovery(rec, sleepRow, profile, tz);
    if (!mapped.date || mapped.empty) {
      result.warnings.push(...mapped.warnings);
      continue;
    }
    await repo.dailyLogs.record(userId, mapped.date, {
      ...mapped.fields, source: PROVIDER, external_id: String(rec.sleep_id ?? rec.cycle_id),
    });
    result.recoveries += 1;
    if (mapped.fields.sleep_hours != null) result.sleeps += 1;
    result.dates.add(mapped.date);
    result.warnings.push(...mapped.warnings);
  }

  // A night with no recovery yet (WHOOP still scoring) should still land its
  // hours, so the brief is not blank.
  for (const s of sleeps ?? []) {
    if (s.nap === true) continue;
    const already = recoveries?.some((r) => String(r.sleep_id) === String(s.id));
    if (already) continue;
    const mapped = mapRecovery(null, s, profile, tz);
    if (!mapped.date || mapped.empty) continue;
    await repo.dailyLogs.record(userId, mapped.date, {
      ...mapped.fields, source: PROVIDER, external_id: String(s.id),
    });
    result.sleeps += 1;
    result.dates.add(mapped.date);
    result.warnings.push(...mapped.warnings);
  }

  for (const w of workouts ?? []) {
    const mapped = mapWorkout(w, profile, tz);
    const { action } = await repo.workouts.upsertExternal(userId, mapped.row);
    if (action === 'created') result.workouts += 1;
    if (action === 'corrected') result.corrected += 1;
    if (action !== 'unchanged') result.dates.add(mapped.row.date);
    result.warnings.push(...mapped.warnings);
  }

  await repo.integrations.touch(userId, PROVIDER);
  result.dates = [...result.dates].sort();
  result.warnings = [...new Set(result.warnings)];
  return result;
}

function wrap(what) {
  return (e) => { throw new Error(`whoop ${what} fetch failed: ${e.message}`); };
}

/** The last couple of days - what the morning brief needs before it composes. */
export function syncRecent(userId, profile, days = 2, opts = {}) {
  const now = new Date();
  return syncRange(userId, profile, {
    start: new Date(now.getTime() - days * 86400000),
    end: now,
    ...opts,
  });
}

/**
 * One-time history import. The trend charts are only as honest as what is
 * behind them, and six months of real WHOOP history beats an empty axis.
 */
export async function backfill(userId, profile, { months = 6, onProgress = null, client = null } = {}) {
  const api = client ?? clientFor(userId);
  const tz = timezoneOf(profile);
  const end = new Date();
  const totals = { recoveries: 0, sleeps: 0, workouts: 0, corrected: 0, warnings: [], chunks: 0 };

  // Walk backwards a month at a time: smaller windows keep each page set short
  // and make a partial failure cheap to resume from.
  for (let i = 0; i < months; i++) {
    const chunkEnd = new Date(end.getTime() - i * 30 * 86400000);
    const chunkStart = new Date(chunkEnd.getTime() - 30 * 86400000);
    const r = await syncRange(userId, profile, { start: chunkStart, end: chunkEnd, client: api });
    totals.recoveries += r.recoveries;
    totals.sleeps += r.sleeps;
    totals.workouts += r.workouts;
    totals.corrected += r.corrected;
    totals.warnings.push(...r.warnings);
    totals.chunks += 1;
    if (onProgress) await onProgress({ month: i + 1, of: months, ...r });
  }
  totals.warnings = [...new Set(totals.warnings)].slice(0, 10);
  return totals;
}

/* --------------------------------------------------------------- webhook --- */

/**
 * Handle one webhook event.
 *
 * WHOOP sends the id of the changed object; for a recovery event that id is the
 * SLEEP uuid, not the recovery's own. We re-fetch rather than trust a payload
 * that carries no values.
 */
export async function handleEvent(userId, rawProfile, event, { client = null } = {}) {
  const api = client ?? clientFor(userId);
  const profile = await effectiveProfile(userId, rawProfile);
  const tz = timezoneOf(profile);
  const type = String(event.type ?? '');
  const id = String(event.id ?? '');

  if (type.endsWith('.deleted')) {
    // Nothing is ever deleted here. A deletion upstream is recorded as a
    // correction that marks the session not completed, so the history still
    // shows that something was there and then was not.
    if (type.startsWith('workout')) {
      const prev = await repo.workouts.byExternalId(userId, PROVIDER, id);
      if (!prev) return { action: 'ignored', reason: 'unknown workout' };
      await repo.workouts.add(userId, {
        ...prev, completed: false, skipped_reason: 'deleted in WHOOP',
        supersedes: prev.id, source: PROVIDER, external_id: id, raw: null,
      });
      return { action: 'marked-deleted' };
    }
    return { action: 'ignored', reason: `${type} needs no action` };
  }

  if (type === 'workout.updated') {
    const w = await api.workoutById(id);
    if (!w) return { action: 'ignored', reason: 'workout not found' };
    const mapped = mapWorkout(w, profile, tz);
    const { action } = await repo.workouts.upsertExternal(userId, mapped.row);
    await repo.integrations.touch(userId, PROVIDER);
    return { action, date: mapped.row.date, warnings: mapped.warnings, zoneMethod: mapped.zoneMethod };
  }

  if (type === 'sleep.updated' || type === 'recovery.updated') {
    const s = await api.sleepById(id);
    if (!s) return { action: 'ignored', reason: 'sleep not found' };
    let rec = null;
    if (type === 'recovery.updated' && s.cycle_id != null) {
      rec = await api.recoveryForCycle(s.cycle_id).catch(() => null);
    }
    const mapped = mapRecovery(rec, s, profile, tz);
    if (!mapped.date || mapped.empty) {
      return { action: 'ignored', reason: 'nothing scoreable yet', warnings: mapped.warnings };
    }
    await repo.dailyLogs.record(userId, mapped.date, {
      ...mapped.fields, source: PROVIDER, external_id: String(s.id),
    });
    await repo.integrations.touch(userId, PROVIDER);
    return { action: 'recorded', date: mapped.date, fields: mapped.fields, warnings: mapped.warnings };
  }

  return { action: 'ignored', reason: `unhandled type ${type}` };
}

/** Pull body measurements - weight, if he steps on a WHOOP-connected scale. */
export async function syncBody(userId, profile, { client = null } = {}) {
  const api = client ?? clientFor(userId);
  const body = await api.body().catch(() => null);
  if (!body?.weight_kilogram) return { updated: false };
  const today = localDate(new Date(), timezoneOf(profile));
  await repo.dailyLogs.record(userId, today, {
    weight_kg: Math.round(Number(body.weight_kilogram) * 10) / 10,
    source: PROVIDER,
  });
  return { updated: true, weight: body.weight_kilogram };
}

export { addDays };
