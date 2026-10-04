#!/usr/bin/env node
// Build the dashboard as a publishable artifact: the same app, reshaped to the
// artifact page contract.
//
//   node scripts/build-artifact.js > /tmp/health-os.html
//
// Differences from the served page:
//   * no doctype / html / head / body wrapper - the platform supplies it
//   * the sticky header offsets by the safe-area inset instead of padding
//     itself, because the platform already pads :root
//   * the payload is a snapshot taken at build time

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProfile, timezoneOf } from '../src/profile.js';
import { localDate } from '../src/lib/time.js';
import * as repo from '../src/repo/index.js';
import { buildDashboardData } from '../src/dashboard/data.js';
import { withSystemDarkMode } from '../src/dashboard/theme.js';
import {
  STRINGS, DIR, LEVEL_NAMES, XP_NAMES, ACHIEVEMENT_NAMES,
  WEEKDAY_SHORT, SESSION_NAMES, MARKER_NAMES, BAND_NAMES,
} from '../src/dashboard/i18n.js';
import { XP_RULES } from '../src/domain/gamification.js';
import { closePool } from '../src/db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', 'src', 'dashboard', f), 'utf8');

const SEPARATORS = new RegExp('[\\u2028\\u2029]', 'g');
const embed = (v) => JSON.stringify(v)
  .replace(/</g, '\\u003c')
  .replace(/>/g, '\\u003e')
  .replace(SEPARATORS, (c) => (c.charCodeAt(0) === 0x2028 ? '\\u2028' : '\\u2029'));

export function buildArtifact(payload) {
  const css = withSystemDarkMode(read('styles.css'))
    // The platform pads :root by the safe-area insets, so the header offsets
    // rather than padding itself - otherwise the inset is applied twice.
    .replace('position: sticky; top: 0; z-index: var(--z-header);',
             'position: sticky; top: env(safe-area-inset-top, 0px); z-index: var(--z-header);')
    .replace('  padding-top: env(safe-area-inset-top);\n', '')
    .replace('  padding-bottom: env(safe-area-inset-bottom);\n', '');

  const i18n = {
    STRINGS, DIR, LEVEL_NAMES, XP_NAMES, ACHIEVEMENT_NAMES,
    WEEKDAY_SHORT, SESSION_NAMES, MARKER_NAMES, BAND_NAMES, XP_RULES_ORDER: XP_RULES,
  };

  return `<title>Health OS</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap">
<style>${css}</style>
<div id="app"></div>
<noscript>
  <div style="padding:24px">This dashboard renders in the browser so the language and theme
  toggles are instant. Enable JavaScript to view it.</div>
</noscript>
<script>window.__DATA__=${embed(payload)};window.__I18N__=${embed(i18n)};</script>
<script>${read('client.js')}</script>
`;
}

async function main() {
  const profile = loadProfile();
  const today = process.env.HOS_DATE || localDate(new Date(), timezoneOf(profile));
  const user = await repo.users.upsertFromProfile(profile);
  const payload = await buildDashboardData(user.id, profile, today);
  process.stdout.write(buildArtifact(payload));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(closePool);
}
