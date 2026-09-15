// Data access. History is append-only: a correction inserts a new row whose
// `supersedes` points at the row it replaces, and every read filters out rows
// that something else supersedes. Nothing is ever deleted.

import { query, one } from '../db.js';

const notSuperseded = (table) =>
  `id not in (select supersedes from ${table} where user_id = $1 and supersedes is not null)`;

/* ---------------------------------------------------------------- users --- */

export const users = {
  async upsertFromProfile(profile) {
    const u = profile.user;
    const existing = await one('select * from users where name = $1', [u.name]);
    if (existing) {
      return one(
        `update users set dob=$2, height_cm=$3, timezone=$4, locale=$5 where id=$1 returning *`,
        [existing.id, u.dob ?? null, u.height_cm ?? null, u.timezone ?? 'Asia/Riyadh', u.locale ?? 'ar-SA'],
      );
    }
    return one(
      `insert into users (name, dob, height_cm, timezone, locale)
       values ($1,$2,$3,$4,$5) returning *`,
      [u.name, u.dob ?? null, u.height_cm ?? null, u.timezone ?? 'Asia/Riyadh', u.locale ?? 'ar-SA'],
    );
  },
  byId: (id) => one('select * from users where id=$1', [id]),
  first: () => one('select * from users order by id limit 1'),
};

/* ----------------------------------------------------------- daily_logs --- */

export const dailyLogs = {
  /** The live row for a date, or null. */
  forDate: (userId, date) =>
    one(
      `select * from daily_logs where user_id=$1 and date=$2 and ${notSuperseded('daily_logs')}
       order by id desc limit 1`,
      [userId, date],
    ),

  /**
   * Record morning metrics. If a row already exists for the day, this writes a
   * new row that supersedes it, merging the fields that were not supplied.
   */
  async record(userId, date, fields) {
    const prev = await dailyLogs.forDate(userId, date);
    const merged = {
      weight_kg: pick(fields.weight_kg, prev?.weight_kg),
      notes: pick(fields.notes, prev?.notes),
      recovery_pct: pick(fields.recovery_pct, prev?.recovery_pct),
      sleep_hours: pick(fields.sleep_hours, prev?.sleep_hours),
      resting_hr: pick(fields.resting_hr, prev?.resting_hr),
      steps: pick(fields.steps, prev?.steps),
      smoke_free: pick(fields.smoke_free, prev?.smoke_free),
    };
    return one(
      `insert into daily_logs
         (user_id, date, weight_kg, notes, recovery_pct, sleep_hours, resting_hr, steps, smoke_free, supersedes)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
      [userId, date, merged.weight_kg, merged.notes, merged.recovery_pct, merged.sleep_hours,
       merged.resting_hr, merged.steps, merged.smoke_free, prev?.id ?? null],
    );
  },

  between: (userId, from, to) =>
    query(
      `select * from daily_logs where user_id=$1 and date between $2 and $3 and ${notSuperseded('daily_logs')}
       order by date asc, id desc`,
      [userId, from, to],
    ),
};

/* ---------------------------------------------------------------- meals --- */

export const meals = {
  add: (userId, row) =>
    one(
      `insert into meals
         (user_id, logged_at, date, description, photo_url, kcal_est, protein_g_est,
          sat_fat_flag, fibre_g_est, source, confidence, supersedes)
       values ($1, coalesce($2, now()), $3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,
      [userId, row.logged_at ?? null, row.date, row.description, row.photo_url ?? null,
       row.kcal_est ?? null, row.protein_g_est ?? null, row.sat_fat_flag ?? false,
       row.fibre_g_est ?? null, row.source ?? 'text', row.confidence ?? 'med', row.supersedes ?? null],
    ),

  forDate: (userId, date) =>
    query(
      `select * from meals where user_id=$1 and date=$2 and ${notSuperseded('meals')}
       order by logged_at asc`,
      [userId, date],
    ),

  between: (userId, from, to) =>
    query(
      `select * from meals where user_id=$1 and date between $2 and $3 and ${notSuperseded('meals')}
       order by date asc, logged_at asc`,
      [userId, from, to],
    ),

  latest: (userId, limit = 1) =>
    query(
      `select * from meals where user_id=$1 and ${notSuperseded('meals')}
       order by logged_at desc limit $2`,
      [userId, limit],
    ),

  search: (userId, term, limit = 30) =>
    query(
      `select * from meals where user_id=$1 and description ilike '%'||$2||'%' and ${notSuperseded('meals')}
       order by logged_at desc limit $3`,
      [userId, term, limit],
    ),
};

/* ------------------------------------------------------------- workouts --- */

export const workouts = {
  add: (userId, row) =>
    one(
      `insert into workouts
         (user_id, logged_at, date, type, duration_min, session_label, avg_hr, max_hr,
          zone2_minutes, rpe, completed, skipped_reason, notes, supersedes)
       values ($1, coalesce($2, now()), $3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning *`,
      [userId, row.logged_at ?? null, row.date, row.type, row.duration_min ?? null,
       row.session_label ?? null, row.avg_hr ?? null, row.max_hr ?? null,
       row.zone2_minutes ?? null, row.rpe ?? null, row.completed ?? true,
       row.skipped_reason ?? null, row.notes ?? null, row.supersedes ?? null],
    ),

  forDate: (userId, date) =>
    query(
      `select * from workouts where user_id=$1 and date=$2 and ${notSuperseded('workouts')}
       order by logged_at asc`,
      [userId, date],
    ),

  between: (userId, from, to) =>
    query(
      `select * from workouts where user_id=$1 and date between $2 and $3 and ${notSuperseded('workouts')}
       order by date asc, logged_at asc`,
      [userId, from, to],
    ),

  /** Map<'YYYY-MM-DD', row[]> for the streak helpers. */
  async mapBetween(userId, from, to) {
    const rows = await workouts.between(userId, from, to);
    return groupByDate(rows);
  },

  search: (userId, term, limit = 30) =>
    query(
      `select * from workouts where user_id=$1
         and (coalesce(notes,'') || ' ' || type || ' ' || coalesce(session_label,'')) ilike '%'||$2||'%'
         and ${notSuperseded('workouts')}
       order by logged_at desc limit $3`,
      [userId, term, limit],
    ),
};

/* ---------------------------------------------------------- supplements --- */

export const supplements = {
  upsert: (userId, s) =>
    one(
      `insert into supplements (user_id, name, dose, timing_slot, status, notes, sort_order)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (user_id, name) do update
         set dose=excluded.dose, timing_slot=excluded.timing_slot,
             status=excluded.status, notes=excluded.notes, sort_order=excluded.sort_order
       returning *`,
      [userId, s.name, s.dose ?? null, s.timing_slot ?? null, s.status ?? 'active',
       s.notes ?? null, s.sort_order ?? 100],
    ),

  active: (userId) =>
    query(
      `select * from supplements where user_id=$1 and status in ('active','pending')
       order by sort_order asc, name asc`,
      [userId],
    ),

  all: (userId) => query('select * from supplements where user_id=$1 order by sort_order, name', [userId]),

  logTaken: (userId, date, supplementId, taken = true) =>
    one(
      `insert into supplements_log (user_id, date, supplement_id, taken, taken_at)
       values ($1,$2,$3,$4, case when $4 then now() else null end)
       on conflict (user_id, date, supplement_id) do update
         set taken=excluded.taken, taken_at=excluded.taken_at
       returning *`,
      [userId, date, supplementId, taken],
    ),

  takenOn: (userId, date) =>
    query(
      `select sl.*, s.name, s.timing_slot from supplements_log sl
         join supplements s on s.id = sl.supplement_id
       where sl.user_id=$1 and sl.date=$2`,
      [userId, date],
    ),
};

/* ----------------------------------------------------------------- labs --- */

export const labs = {
  add: (userId, row) =>
    one(
      `insert into labs
         (user_id, drawn_on, marker, value, unit, value_mgdl, reference_range, flag,
          fasting, lab_name, accession, note, supersedes)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning *`,
      [userId, row.drawn_on, row.marker, row.value, row.unit, row.value_mgdl ?? null,
       row.reference_range ?? null, row.flag ?? null, row.fasting ?? null,
       row.lab_name ?? null, row.accession ?? null, row.note ?? null, row.supersedes ?? null],
    ),

  all: (userId) =>
    query(
      `select * from labs where user_id=$1 and ${notSuperseded('labs')} order by drawn_on desc, marker asc`,
      [userId],
    ),

  forMarker: (userId, marker) =>
    query(
      `select * from labs where user_id=$1 and marker=$2 and ${notSuperseded('labs')}
       order by drawn_on asc`,
      [userId, marker],
    ),

  /** True when this exact reading is already stored, so seeding stays idempotent. */
  exists: (userId, drawnOn, marker) =>
    one('select id from labs where user_id=$1 and drawn_on=$2 and marker=$3', [userId, drawnOn, marker]),
};

/* ----------------------------------------------------------- body_scans --- */

export const bodyScans = {
  add: (userId, row) =>
    one(
      `insert into body_scans
         (user_id, scanned_on, weight_kg, body_fat_pct, body_fat_kg, skeletal_muscle_kg,
          visceral_level, whr, bmi, score, device, segmental_json, supersedes)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning *`,
      [userId, row.scanned_on, row.weight_kg ?? null, row.body_fat_pct ?? null,
       row.body_fat_kg ?? null, row.skeletal_muscle_kg ?? null, row.visceral_level ?? null,
       row.whr ?? null, row.bmi ?? null, row.score ?? null, row.device ?? null,
       row.segmental ? JSON.stringify(row.segmental) : null, row.supersedes ?? null],
    ),

  all: (userId) =>
    query(
      `select * from body_scans where user_id=$1 and ${notSuperseded('body_scans')} order by scanned_on desc`,
      [userId],
    ),

  latest: (userId) =>
    one(
      `select * from body_scans where user_id=$1 and ${notSuperseded('body_scans')}
       order by scanned_on desc limit 1`,
      [userId],
    ),

  exists: (userId, scannedOn) =>
    one('select id from body_scans where user_id=$1 and scanned_on=$2', [userId, scannedOn]),
};

/* -------------------------------------------------------------- smoking --- */

export const smoking = {
  add: (userId, row) =>
    one(
      `insert into smoking (user_id, date, cigarettes, craving_peak, trigger, quit_date_active, note, supersedes)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
      [userId, row.date, row.cigarettes ?? null, row.craving_peak ?? null, row.trigger ?? null,
       row.quit_date_active ?? null, row.note ?? null, row.supersedes ?? null],
    ),

  between: (userId, from, to) =>
    query(
      `select * from smoking where user_id=$1 and date between $2 and $3 and ${notSuperseded('smoking')}
       order by date asc, id asc`,
      [userId, from, to],
    ),

  async mapBetween(userId, from, to) {
    return groupByDate(await smoking.between(userId, from, to));
  },
};

/* ------------------------------------------------------------- messages --- */

export const messages = {
  add: (userId, row) =>
    one(
      `insert into messages (user_id, direction, channel, kind, body, meta)
       values ($1,$2,$3,$4,$5,$6) returning *`,
      [userId, row.direction, row.channel ?? 'telegram', row.kind, row.body,
       row.meta ? JSON.stringify(row.meta) : null],
    ),

  /** Recent conversation, oldest first, for the coach's context window. */
  async recentChat(userId, limit = 20) {
    const rows = await query(
      `select direction, body, sent_at from messages
       where user_id=$1 and kind in ('chat','log') order by sent_at desc limit $2`,
      [userId, limit],
    );
    return rows.reverse();
  },

};

/* ------------------------------------------------------------- job_runs --- */

export const jobRuns = {
  /**
   * Claim a job for a local date. Returns true exactly once per (job, date)
   * even if two schedulers race - the unique index decides.
   */
  async claim(userId, jobKey, runDate) {
    const row = await one(
      `insert into job_runs (user_id, job_key, run_date) values ($1,$2,$3)
       on conflict (user_id, job_key, run_date) do nothing returning id`,
      [userId, jobKey, runDate],
    );
    return Boolean(row);
  },
  finish: (userId, jobKey, runDate, status, detail) =>
    query(
      `update job_runs set status=$4, detail=$5 where user_id=$1 and job_key=$2 and run_date=$3`,
      [userId, jobKey, runDate, status, detail ?? null],
    ),
  ranOn: (userId, runDate) =>
    query('select * from job_runs where user_id=$1 and run_date=$2', [userId, runDate]),
};

/* ------------------------------------------------------------- settings --- */

export const settings = {
  async get(userId, key, fallback = null) {
    const row = await one('select value from settings where user_id=$1 and key=$2', [userId, key]);
    return row ? row.value : fallback;
  },
  set: (userId, key, value) =>
    one(
      `insert into settings (user_id, key, value) values ($1,$2,$3)
       on conflict (user_id, key) do update set value=excluded.value, updated_at=now() returning *`,
      [userId, key, JSON.stringify(value)],
    ),
};

/* ----------------------------------------------------------- open_items --- */

export const openItems = {
  upsert: (userId, item) =>
    one(
      `insert into open_items (user_id, title, category, due_on, note)
       values ($1,$2,$3,$4,$5)
       on conflict (user_id, title) do update set category=excluded.category, due_on=excluded.due_on
       returning *`,
      [userId, item.title, item.category ?? null, item.due_on ?? null, item.note ?? null],
    ),
  open: (userId) =>
    query('select * from open_items where user_id=$1 and not done order by due_on nulls last, id', [userId]),
  complete: (userId, title, onDate) =>
    one(
      `update open_items set done=true, done_on=$3 where user_id=$1 and title ilike $2 returning *`,
      [userId, title, onDate],
    ),
};

/* ---------------------------------------------------------------- utils --- */

function pick(next, prev) { return next === undefined ? (prev ?? null) : next; }

function groupByDate(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.date)) map.set(r.date, []);
    map.get(r.date).push(r);
  }
  return map;
}
