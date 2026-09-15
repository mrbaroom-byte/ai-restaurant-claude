#!/usr/bin/env node
// Phase 1: load everything from the profile into the database.
// Idempotent - re-running updates rather than duplicating.

import { loadProfile } from '../src/profile.js';
import { normaliseLab } from '../src/lib/units.js';
import * as repo from '../src/repo/index.js';
import { migrate } from '../src/migrate.js';
import { closePool } from '../src/db.js';

async function main() {
  const profile = loadProfile();
  await migrate();

  const user = await repo.users.upsertFromProfile(profile);
  console.log(`user ${user.id}: ${user.name}`);

  let n = 0;
  for (const s of profile.supplements ?? []) { await repo.supplements.upsert(user.id, s); n++; }
  console.log(`supplements: ${n}`);

  let labCount = 0;
  let suspectCount = 0;
  for (const panel of profile.labs ?? []) {
    for (const r of panel.results ?? []) {
      const norm = normaliseLab(r);
      if (norm.suspect) {
        console.warn(`  ! skipped ${panel.drawn_on} ${r.marker}: ${norm.reason}`);
        suspectCount++;
        continue;
      }
      if (await repo.labs.exists(user.id, panel.drawn_on, norm.marker)) continue;
      await repo.labs.add(user.id, {
        drawn_on: panel.drawn_on,
        marker: norm.marker,
        value: norm.value,
        unit: norm.unit ?? '',
        value_mgdl: norm.value_mgdl,
        reference_range: r.reference_range ?? null,
        flag: r.flag ?? null,
        fasting: panel.fasting ?? null,
        lab_name: panel.lab_name ?? null,
        accession: panel.accession ?? null,
        note: panel.note ?? null,
      });
      labCount++;
    }
  }
  console.log(`labs: ${labCount} stored${suspectCount ? `, ${suspectCount} rejected as implausible` : ''}`);

  let scanCount = 0;
  for (const s of profile.body_scans ?? []) {
    if (await repo.bodyScans.exists(user.id, s.scanned_on)) continue;
    await repo.bodyScans.add(user.id, s);
    scanCount++;
  }
  console.log(`body scans: ${scanCount}`);

  let items = 0;
  for (const o of profile.open_items ?? []) { await repo.openItems.upsert(user.id, o); items++; }
  console.log(`open items: ${items}`);

  // WHOOP monthly averages become the earliest points on the trend charts, so
  // the dashboard is not empty on day one. One synthetic row per month, dated
  // to the first of the month and clearly marked.
  let whoopRows = 0;
  for (const m of profile.whoop?.monthly_180d ?? []) {
    const date = `${m.month}-01`;
    const existing = await repo.dailyLogs.forDate(user.id, date);
    if (existing) continue;
    await repo.dailyLogs.record(user.id, date, {
      resting_hr: m.resting_hr ?? null,
      sleep_hours: m.sleep_hours ?? null,
      notes: `WHOOP monthly average (${m.aerobic_min_per_day} aerobic min/day)`,
    });
    whoopRows++;
  }
  console.log(`whoop monthly baselines: ${whoopRows}`);

  await repo.settings.set(user.id, 'block', profile.training.block);
  await repo.settings.set(user.id, 'quit_date', profile.smoking?.quit_date ?? null);
  console.log('settings written');
  console.log('\nseed complete.');
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(closePool);
