// The dashboard shell.
//
// The server builds a language-neutral payload; the browser renders it. That
// split is what lets the language and theme toggles be instant, and it means
// the same shell serves the deployed dashboard and a standalone snapshot.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDashboardData } from './data.js';
import {
  STRINGS, DIR, LEVEL_NAMES, XP_NAMES, ACHIEVEMENT_NAMES,
  WEEKDAY_SHORT, SESSION_NAMES, MARKER_NAMES, BAND_NAMES,
} from './i18n.js';
import { XP_RULES } from '../domain/gamification.js';
import { withSystemDarkMode } from './theme.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, f), 'utf8');

// U+2028 / U+2029 are valid in JSON but terminate a line in a <script> block.
const SEPARATORS = new RegExp('[\\u2028\\u2029]', 'g');

/** Safe to drop inside a <script> block: no `</script>`, no `<!--`. */
function embed(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(SEPARATORS, (c) => (c.charCodeAt(0) === 0x2028 ? '\\u2028' : '\\u2029'));
}

const I18N = {
  STRINGS, DIR, LEVEL_NAMES, XP_NAMES, ACHIEVEMENT_NAMES,
  WEEKDAY_SHORT, SESSION_NAMES, MARKER_NAMES, BAND_NAMES,
  XP_RULES_ORDER: XP_RULES,
};

/**
 * Assemble the page from a payload. Exported separately from the DB read so a
 * snapshot can be rendered without a database.
 */
export function renderPage(payload, { lang = 'ar', theme = 'light' } = {}) {
  const css = withSystemDarkMode(read('styles.css'));
  const js = read('client.js');
  return `<!doctype html>
<html lang="${lang}" dir="${DIR[lang] ?? 'rtl'}" data-theme="${theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#E9E6DE" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#14181A" media="(prefers-color-scheme: dark)">
<title>Health OS</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap">
<style>${css}</style>
</head>
<body data-lang="${lang}">
<div id="app"></div>
<noscript>
  <div style="padding:24px;font-family:system-ui">
    This dashboard renders in the browser so the language and theme toggles are instant.
    Enable JavaScript to view it.
  </div>
</noscript>
<script>window.__DATA__=${embed(payload)};window.__I18N__=${embed(I18N)};</script>
<script>${js}</script>
</body>
</html>`;
}

/** Read from the database and render. */
export async function renderDashboard(userId, profile, today, opts = {}) {
  const payload = await buildDashboardData(userId, profile, today);
  return renderPage(payload, {
    lang: opts.lang ?? (profile.user?.locale ?? 'ar-SA').slice(0, 2),
    theme: opts.theme ?? 'light',
  });
}

/** The payload on its own, for snapshots and for testing. */
export { buildDashboardData };
