-- Personal Health OS - schema
-- Design rules enforced here:
--   * history is append-only; corrections are new rows pointing at `supersedes`
--   * lab values are stored in BOTH the original unit and mg/dL (see src/lib/units.js)
--   * every log row carries the local (Asia/Riyadh) calendar date it belongs to,
--     because "did he train today" is a local-day question, not a UTC one

create table if not exists users (
  id            bigserial primary key,
  name          text        not null,
  dob           date,
  height_cm     numeric(5,1),
  timezone      text        not null default 'Asia/Riyadh',
  locale        text        not null default 'ar-SA',
  created_at    timestamptz not null default now()
);

create table if not exists daily_logs (
  id            bigserial primary key,
  user_id       bigint      not null references users(id) on delete cascade,
  date          date        not null,
  weight_kg     numeric(5,2),
  notes         text,
  recovery_pct  int,
  sleep_hours   numeric(4,2),
  resting_hr    int,
  steps         int,
  smoke_free    boolean,
  supersedes    bigint      references daily_logs(id),
  created_at    timestamptz not null default now()
);
-- One *current* row per day: later rows supersede earlier ones rather than updating.
create index if not exists daily_logs_user_date_idx on daily_logs (user_id, date desc, id desc);

create table if not exists meals (
  id              bigserial primary key,
  user_id         bigint      not null references users(id) on delete cascade,
  logged_at       timestamptz not null default now(),
  date            date        not null,
  description     text        not null,
  photo_url       text,
  kcal_est        int,
  protein_g_est   numeric(6,1),
  sat_fat_flag    boolean     not null default false,
  fibre_g_est     numeric(5,1),
  source          text        not null default 'text' check (source in ('text','photo')),
  confidence      text        not null default 'med' check (confidence in ('low','med','high')),
  supersedes      bigint      references meals(id),
  created_at      timestamptz not null default now()
);
create index if not exists meals_user_date_idx on meals (user_id, date desc, logged_at desc);

create table if not exists workouts (
  id              bigserial primary key,
  user_id         bigint      not null references users(id) on delete cascade,
  logged_at       timestamptz not null default now(),
  date            date        not null,
  type            text        not null check (type in ('zone2','strength','walk','other')),
  duration_min    int,
  session_label   text        check (session_label in ('A','B')),
  avg_hr          int,
  max_hr          int,
  zone2_minutes   int,
  rpe             numeric(3,1),
  completed       boolean     not null default true,
  skipped_reason  text,
  notes           text,
  supersedes      bigint      references workouts(id),
  created_at      timestamptz not null default now()
);
create index if not exists workouts_user_date_idx on workouts (user_id, date desc, logged_at desc);

create table if not exists supplements (
  id            bigserial primary key,
  user_id       bigint      not null references users(id) on delete cascade,
  name          text        not null,
  dose          text,
  timing_slot   text,                        -- '07:00' | '16:30' | '22:00' | 'as-needed'
  status        text        not null default 'active'
                check (status in ('active','pending','discontinued')),
  notes         text,
  sort_order    int         not null default 100,
  created_at    timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists supplements_log (
  id             bigserial primary key,
  user_id        bigint      not null references users(id) on delete cascade,
  date           date        not null,
  supplement_id  bigint      not null references supplements(id) on delete cascade,
  taken          boolean     not null default true,
  taken_at       timestamptz,
  created_at     timestamptz not null default now(),
  unique (user_id, date, supplement_id)
);

create table if not exists labs (
  id               bigserial primary key,
  user_id          bigint      not null references users(id) on delete cascade,
  drawn_on         date        not null,
  marker           text        not null,     -- canonical key, e.g. 'ldl', 'hba1c'
  value            numeric(12,4) not null,   -- as reported by the lab
  unit             text        not null,     -- as reported by the lab, e.g. 'mmol/L'
  value_mgdl       numeric(12,4),            -- converted, null when the marker has no mg/dL form
  reference_range  text,
  flag             text,                     -- 'high' | 'low' | 'normal' | 'very_high'
  fasting          boolean,
  lab_name         text,
  accession        text,
  note             text,
  supersedes       bigint      references labs(id),
  created_at       timestamptz not null default now()
);
create index if not exists labs_user_marker_idx on labs (user_id, marker, drawn_on desc);

create table if not exists body_scans (
  id                  bigserial primary key,
  user_id             bigint      not null references users(id) on delete cascade,
  scanned_on          date        not null,
  weight_kg           numeric(5,2),
  body_fat_pct        numeric(4,1),
  body_fat_kg         numeric(5,2),
  skeletal_muscle_kg  numeric(5,2),
  visceral_level      int,
  whr                 numeric(4,2),
  bmi                 numeric(4,1),
  score               int,
  device              text,
  segmental_json      jsonb,
  supersedes          bigint      references body_scans(id),
  created_at          timestamptz not null default now()
);

create table if not exists smoking (
  id               bigserial primary key,
  user_id          bigint      not null references users(id) on delete cascade,
  date             date        not null,
  cigarettes       int,
  craving_peak     int         check (craving_peak between 1 and 10),
  trigger          text,
  quit_date_active date,
  note             text,
  supersedes       bigint      references smoking(id),
  created_at       timestamptz not null default now()
);
create index if not exists smoking_user_date_idx on smoking (user_id, date desc, id desc);

create table if not exists messages (
  id          bigserial primary key,
  user_id     bigint      not null references users(id) on delete cascade,
  sent_at     timestamptz not null default now(),
  direction   text        not null check (direction in ('out','in')),
  channel     text        not null default 'telegram',
  kind        text        not null check (kind in ('brief','nudge','log','chat','review','alert','error')),
  body        text        not null,
  meta        jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists messages_user_sent_idx on messages (user_id, sent_at desc);

-- Scheduler idempotency: a job fires at most once per local day.
create table if not exists job_runs (
  id          bigserial primary key,
  user_id     bigint      not null references users(id) on delete cascade,
  job_key     text        not null,
  run_date    date        not null,
  ran_at      timestamptz not null default now(),
  status      text        not null default 'ok',
  detail      text,
  unique (user_id, job_key, run_date)
);

-- Free-form key/value for things that are state, not history
-- (e.g. the active quit date, the current training block start).
create table if not exists settings (
  user_id     bigint      not null references users(id) on delete cascade,
  key         text        not null,
  value       jsonb       not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, key)
);

-- Open medical/admin items carried forward (spec section 17).
create table if not exists open_items (
  id          bigserial primary key,
  user_id     bigint      not null references users(id) on delete cascade,
  title       text        not null,
  category    text,
  due_on      date,
  done        boolean     not null default false,
  done_on     date,
  note        text,
  created_at  timestamptz not null default now(),
  unique (user_id, title)
);
