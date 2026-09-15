# Personal Health OS

A single-user daily coaching, logging and tracking system. It sends scheduled
messages over Telegram, logs everything he replies with, keeps the history, and
answers as a coach that holds his whole clinical and training context.

---

## ⚠️ Privacy — read this first

**This repository is public.** No personal health data is committed to it, and
none should be.

Everything personal — name, date of birth, lab values, smoking status, body
composition — lives in `config/profile.json`, which is **gitignored**. The code
reads personal facts from that file at runtime and hard-codes none of them. The
committed `config/profile.example.json` shows the shape with placeholder values.

Before running this for real:

1. Move this directory into a **private** repository, or make this one private.
2. Put the real `config/profile.json` in place (it is never committed).
3. Keep the database private — Supabase with row-level security, or a private
   Postgres instance.
4. Never paste the profile or the database contents into a third-party service
   other than the Anthropic API.

`git check-ignore -v config/profile.json` should print a match. If it does not,
stop and fix `.gitignore` before committing anything.

---

## What it does

| | |
|---|---|
| **Notifies** | Morning brief, pre-session prompt, midday fuel check, psyllium reminder, evening sweep, bedtime, Sunday weekly review |
| **Logs** | Meals (photo or text), workouts, weight, morning metrics, supplements, smoking, labs, body scans |
| **Tracks** | 90-day trends, lab history in both the reported unit and mg/dL, streaks |
| **Coaches** | Conversational, full context, guardrailed |
| **Scores** | XP per day, seven levels, fourteen achievements — all recomputed from the log, never stored |
| **Speaks** | Arabic and English throughout, switchable from the bot (`/lang`) or the dashboard |
| **Themes** | Light and dark, following the device by default |

Reply to any message to log something. Send a photo of a plate and it comes back
with an estimate you can correct.

## Gamification, and what it deliberately does not reward

His failure mode is programme decay, not lack of effort, so points are paid for
**doing what the day prescribed** — which on a red-recovery day means walking or
resting. Lifting through a red day earns nothing for the session; backing off
earns `rest_respected`, and there is an achievement for it.

Nothing rewards a deeper deficit, a lower weight, a skipped meal or a longer
fast. Those would put the scoreboard in direct conflict with the guardrails, and
the guardrails win. Nothing ever subtracts either: a bad day scores zero.

| | |
|---|---|
| Daily XP | morning numbers 10 · session 30 · respected rest 20 · protein 20 · meals logged 10 · 7 h sleep 10 · supplements 10 · smoke-free 25 |
| Levels | seven, 0 → 7,000 XP, each with a name in both languages |
| Achievements | fourteen, evaluated as pure predicates over the history — correct the log and the badge corrects itself |

`/stats` in the bot shows the level, what was earned today and what is still
available. The dashboard shows the same thing as a ring, chips and a badge grid.

## Language and theme

Both surfaces are bilingual.

- **Bot**: `/lang` toggles, `/lang en` sets explicitly. The preference is stored
  per user and drives the deterministic copy *and* the language the coach is
  told to write in.
- **Dashboard**: a header toggle, no round trip. The server sends a
  language-neutral payload — keys, numbers and dates, never a rendered sentence —
  and the browser holds both string tables, so there is only ever one copy of
  the data. `?lang=en&theme=dark` pins a view for a shareable link.
- **Theme**: light and dark, following the device by default and overridable.
  Dark is a selected set of steps validated against the dark surface, not an
  inversion of the light one.

Mixed Arabic/Latin runs are wrapped in Unicode bidi isolates. Without them
`1 / 6` renders as `6 / 1` and heart-rate ranges reverse — in Telegram and in
HTML alike, which is why the fix is a character and not a `<span dir="ltr">`.

---

## Architecture

One Node process does all three jobs, because the service has to be online for
the Telegram webhook anyway:

```
Telegram  ──webhook──▶  src/index.js  ──▶ src/bot/router.js ──▶ Anthropic API
                             │
                             ├─▶ src/scheduler/  (60s tick, local-clock aware)
                             ├─▶ src/dashboard/  (GET /dashboard?token=…)
                             └─▶ Postgres (Supabase)
```

| Layer | Choice |
|---|---|
| Runtime | Node 20+, ESM, two dependencies (`pg`, `@anthropic-ai/sdk`) |
| Database | Postgres / Supabase |
| Channel | Telegram bot (two-way), Resend email as a fallback for the weekly review |
| Model | Anthropic Messages API |

### Why an internal scheduler rather than Railway cron

Cron jobs spin up a fresh container per firing and would duplicate the service's
boot cost several times a day. A 60-second tick inside the running process reads
the *user's* local clock, so a schedule change is a profile edit rather than a
redeploy, and `job_runs` has a unique index on `(user, job, local date)` — a
restart, a second replica or a clock skew can never send the same brief twice.

### Design rules the code enforces

- **History is append-only.** A correction inserts a new row whose `supersedes`
  points at the row it replaces. Nothing is deleted; every read filters out
  superseded rows.
- **Lab values are stored twice**, in the unit the lab reported and in mg/dL.
  An implausible value is rejected with an explanation rather than stored, so a
  mmol/L figure pasted into a mg/dL column cannot enter the history. There are
  tests for it.
- **Personal facts live in the profile, not in code.** `stableSystem()` builds
  the coach's prompt from the profile, so swapping the profile swaps the coach.
- **Scheduled messages degrade gracefully.** Each job composes its facts
  deterministically first and only then asks the model for the one human line on
  top. If the API is down the message still goes out.

---

## Setup

### 1. Database

Any Postgres. For Supabase, take the connection string from
Project Settings → Database.

```bash
cp .env.example .env     # then fill it in
npm install
npm run migrate
```

### 2. Profile

```bash
cp config/profile.example.json config/profile.json
$EDITOR config/profile.json
npm run seed             # loads profile data into the database, idempotent
```

On a hosted deployment there is no file to mount and the profile must not be
committed, so pass it as an environment variable instead — `PROFILE_B64`
(base64, which survives dashboard paste boxes) or `PROFILE_JSON`. An inline
value wins over `PROFILE_PATH`.

```bash
base64 -w0 config/profile.json     # paste the result into PROFILE_B64
```

The seed also writes the WHOOP monthly averages as dated baseline rows so the
trend charts are not empty on day one.

### 3. Telegram

1. Talk to [@BotFather](https://t.me/botfather), `/newbot`, copy the token.
2. Message your new bot once, then read your numeric chat id (for example from
   `https://api.telegram.org/bot<TOKEN>/getUpdates`).
3. Set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` and a random
   `TELEGRAM_WEBHOOK_SECRET`.
4. Deploy, then point Telegram at the deployment:

```bash
npm run set-webhook
```

Any update from a chat id other than `TELEGRAM_CHAT_ID` is dropped without a
reply.

### 4. Deploy

Railway picks up `railway.json`. Set every variable from `.env.example` in the
Railway dashboard, generate a domain, set `PUBLIC_BASE_URL` to it, then run
`npm run set-webhook` once.

Migrations run on boot unless `RUN_MIGRATIONS=false`.

---

## Using it

### Telegram

| Command | What it does |
|---|---|
| `/day` | Where he is today against the targets |
| `/brief` | The morning brief, on demand |
| `/meal <text>` or a photo | Estimate and log a meal |
| `/food <item>` | Estimate without logging |
| `/log <…>` | Workout, weight, morning metrics, or a free note |
| `/week` | The weekly review |
| `/labs <…>` | Enter bloodwork; converts units and recomputes trends |
| `/rescan <…>` | Enter a new InBody |
| `/quit <…>` | Smoke-free counter, craving and trigger logging |
| `/stats` | Level, XP earned today, what is still available, achievements |
| `/supps` | Tick supplements off |
| `/dash` | Link to the dashboard |
| `/lang` | Switch between Arabic and English |

Anything else goes to the coach.

`/log` accepts terse input in any order:

```
log recovery 55 sleep 7.2 rhr 72 steps 4200
log 81.4
log z2 22
log strength A rpe 7
log walk 35 hr 118
log skipped travel
```

A bare `hr` inside a workout line is read as the session's average heart rate,
never as resting HR.

### CLI

Everything the bot can do, without Telegram — this is how Phase 1 ran before the
bot existed, and it is still the fastest way to debug:

```bash
node src/cli.js day
node src/cli.js log "recovery 55 sleep 7.2 rhr 72"
node src/cli.js labs "2026-03-04 ldl 4.1 mmol/L, hdl 1.3 mmol/L"
node src/cli.js brief
node src/cli.js tick                    # run one scheduler tick now
node src/cli.js dashboard > /tmp/d.html
```

### Dashboard

`GET /dashboard?token=$DASHBOARD_TOKEN` — one self-contained response,
mobile-first, inline SVG charts, no external requests except the font stylesheet.
Add `&lang=en` or `&theme=dark` to pin a view.

Charts carry a hover crosshair and tooltip, arrow-key navigation from the
keyboard, a per-chart table view for screen readers, and an `aria-label` that
summarises the series. Colour is never the only channel: every recovery state
ships a distinct glyph and the readiness word beside it, because a red/green
status pair cannot be made colourblind-safe by choosing better hues — the
palette checker in the `dataviz` skill says so, and the relief it prescribes is
secondary encoding.

Palette steps were picked against the surface they sit on and run through that
checker for lightness band, chroma floor, CVD separation and contrast. The
limestone / ink / teal / oxide identity is carried over from the four existing
artifacts rather than re-invented.

### As a standalone page

```bash
node scripts/build-artifact.js > health-os.html
```

Produces the same app as a single file shaped to the Claude artifact contract —
no document wrapper, three-state theming, a payload snapshot taken at build
time. Useful for sharing a read-only view without exposing the service.

---

## Schedule

All times are the user's local timezone and live in `profile.schedule`.

| Time | Message |
|---|---|
| 07:00 | Morning brief — recovery, today's session, readiness, supplements, one focus |
| 13:00 | Fuel check — protein so far against target |
| 16:30 | Psyllium (only once its status is `active`) |
| 17:00 | Pre-session prompt with the day's exact exercises |
| 21:00 | Evening sweep — fires only if a training day has nothing logged |
| 21:30 | Bedtime wind-down |
| Sun 20:00 | Weekly review, also emailed if Resend is configured |

Event triggers fire at most once a day, outside the fixed slots:

- Recovery red (or yellow with under six hours of sleep) → the day is downgraded
  and he is told **before** he trains
- Two consecutive days at zero aerobic minutes → escalated nudge (suppressed on
  a red day, so two nudges never contradict each other)
- Quit date within seven days → a specific prep step for that day
- An open item due today → reminder

---

## Model

`ANTHROPIC_MODEL` defaults to `claude-sonnet-4-6`, which is what the build spec
pinned. `claude-sonnet-5` and `claude-opus-5` are the current generation and are
drop-in replacements — change the variable, nothing else.

Two call shapes are used:

- **Coaching text** — a two-block system prompt. The stable block (the profile)
  carries the cache breakpoint; today's numbers go after it, so a changed number
  does not invalidate the cached prefix.
- **Meal estimation** — a forced call to a `strict` tool, so the estimate comes
  back schema-valid. A defensive text parse (fences stripped) is kept as a
  fallback so a malformed reply can never throw into the message loop.

---

## Tests

```bash
npm test
```

50 tests, no database and no network required. They cover the things that are
expensive to get wrong: unit conversion and the rejection of implausible values,
the recovery overlay, the never-miss-twice logic, the quit-window calorie rule,
the calorie floor, terse-input parsing, and that every guardrail and hard
constraint survives into the system prompt.

They run against `config/profile.json` when it exists and the committed example
otherwise, so a fresh clone can run them.

---

## Build order

The spec's own instruction was to ship the first three phases before anything
else, on the grounds that a brief which arrives reliably for two weeks is worth
more than a complete system that is never finished.

| Phase | State |
|---|---|
| 1 — Data layer, seeded, manual entry | done (`sql/`, `src/repo/`, `src/cli.js`) |
| 2 — Telegram bot, two-way, text then photo | done (`src/bot/`, `src/channels/`) |
| 3 — Scheduler, morning brief | done (`src/scheduler/`) |
| 4 — AI coach with full context | done (`src/coach/`) |
| 5 — Remaining notifications and event triggers | done (`src/scheduler/jobs.js`) |
| 6 — Dashboard | done (`src/dashboard/`) — bilingual, themed, gamified |
| 7 — WHOOP integration | **not done** — recovery, sleep and resting HR are entered manually each morning via `log recovery …`. The monthly averages from the exported reports are seeded as baseline rows. Wire the WHOOP API into `repo.dailyLogs.record()` when the endpoints are available; nothing else needs to change. |

---

## What this is not

It does not give medical advice. It tracks, reminds, and coaches on training and
nutrition. Anything touching diagnosis, medication, dosing or symptoms is routed
to his doctor — that instruction is in the system prompt, and there is a test
asserting it is still there.
