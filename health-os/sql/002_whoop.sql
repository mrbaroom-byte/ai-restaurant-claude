-- WHOOP integration.
--
-- Imported rows carry the provider's own id so a repeated `*.updated` webhook
-- corrects the existing row (a new row pointing at it via `supersedes`) instead
-- of inserting a duplicate. History stays append-only.

alter table workouts   add column if not exists source      text;
alter table workouts   add column if not exists external_id text;
alter table workouts   add column if not exists raw         jsonb;

alter table daily_logs add column if not exists source      text;
alter table daily_logs add column if not exists external_id text;

create index if not exists workouts_external_idx
  on workouts (user_id, source, external_id) where external_id is not null;
create index if not exists daily_logs_external_idx
  on daily_logs (user_id, source, external_id) where external_id is not null;

-- Everything a provider connection needs, in one row per provider. Tokens live
-- here rather than in `settings` so they can be revoked without touching
-- unrelated preferences.
create table if not exists integrations (
  id             bigserial primary key,
  user_id        bigint      not null references users(id) on delete cascade,
  provider       text        not null,
  external_user  text,
  access_token   text,
  refresh_token  text,
  expires_at     timestamptz,
  scopes         text,
  status         text        not null default 'connected'
                 check (status in ('connected','expired','revoked','error')),
  last_sync_at   timestamptz,
  last_error     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, provider)
);

-- Raw webhook deliveries, kept so a failed handler can be replayed and so a
-- surprising import can be traced back to exactly what the provider sent.
create table if not exists webhook_events (
  id           bigserial primary key,
  user_id      bigint      references users(id) on delete cascade,
  provider     text        not null,
  event_type   text        not null,
  external_id  text,
  trace_id     text,
  payload      jsonb       not null,
  received_at  timestamptz not null default now(),
  handled_at   timestamptz,
  status       text        not null default 'pending'
               check (status in ('pending','ok','ignored','error')),
  detail       text,
  unique (provider, event_type, external_id, trace_id)
);
create index if not exists webhook_events_recent_idx on webhook_events (provider, received_at desc);
