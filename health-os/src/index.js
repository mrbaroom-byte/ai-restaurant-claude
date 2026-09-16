// The service. One process: Telegram webhook + dashboard + scheduler.

import http from 'node:http';
import { loadProfile, timezoneOf } from './profile.js';
import { localDate } from './lib/time.js';
import * as repo from './repo/index.js';
import { handleUpdate } from './bot/router.js';
import { renderDashboard } from './dashboard/render.js';
import { startScheduler } from './scheduler/index.js';
import { migrate } from './migrate.js';
import { handleWhoopRoute } from './integrations/whoop/routes.js';

const PORT = Number(process.env.PORT ?? 3000);

function requiredEnv() {
  const missing = ['DATABASE_URL', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'TELEGRAM_WEBHOOK_SECRET', 'ANTHROPIC_API_KEY']
    .filter((k) => !process.env[k]);
  // WHOOP is optional; the system runs on manual morning entry without it.
  if (missing.length) throw new Error(`Missing required env: ${missing.join(', ')}`);
}

async function readBody(req, limitBytes = 2_000_000) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limitBytes) throw new Error('payload too large');
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function send(res, status, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': contentType, 'cache-control': 'no-store' });
  res.end(body);
}

export async function createServer({ userId, profile }) {
  const webhookPath = `/telegram/${process.env.TELEGRAM_WEBHOOK_SECRET}`;

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);

    try {
      // Read the body once and hand the exact bytes on: the WHOOP signature is
      // computed over the raw payload, and re-serialising the parsed JSON
      // produces a different string.
      if (req.method === 'POST') req.rawBody = readBody(req);

      if (url.pathname.startsWith('/whoop/')) {
        const handled = await handleWhoopRoute(req, res, url, { userId, send });
        if (handled) return;
      }

      if (url.pathname === '/health' || url.pathname === '/') {
        return send(res, 200, JSON.stringify({ ok: true, date: localDate(new Date(), timezoneOf(profile)) }), 'application/json');
      }

      if (req.method === 'POST' && url.pathname === webhookPath) {
        // Telegram echoes the secret in a header; the path alone is not enough
        // because paths leak into logs and proxies.
        if (req.headers['x-telegram-bot-api-secret-token'] !== process.env.TELEGRAM_WEBHOOK_SECRET) {
          return send(res, 401, 'unauthorized');
        }
        const raw = await req.rawBody;
        // Acknowledge immediately: Telegram retries anything slower than ~10s,
        // and the coach call can take longer than that.
        send(res, 200, 'ok');
        let update;
        try { update = JSON.parse(raw); } catch { return; }
        handleUpdate(update, { userId }).catch((e) => console.error('[webhook]', e));
        return;
      }

      if (url.pathname === '/dashboard') {
        const token = url.searchParams.get('token');
        if (!process.env.DASHBOARD_TOKEN || token !== process.env.DASHBOARD_TOKEN) {
          return send(res, 401, 'unauthorized');
        }
        const today = localDate(new Date(), timezoneOf(profile));
        const html = await renderDashboard(userId, profile, today);
        return send(res, 200, html, 'text/html; charset=utf-8');
      }

      return send(res, 404, 'not found');
    } catch (e) {
      console.error('[http]', e);
      if (!res.headersSent) send(res, 500, 'internal error');
    }
  });
}

async function main() {
  requiredEnv();
  const profile = loadProfile();

  if (String(process.env.RUN_MIGRATIONS ?? 'true') !== 'false') await migrate();

  const user = await repo.users.upsertFromProfile(profile);
  console.log(`[boot] user ${user.id} (${user.name}) tz=${user.timezone}`);

  const server = await createServer({ userId: user.id, profile });
  server.listen(PORT, () => console.log(`[boot] listening on ${PORT}`));

  if (String(process.env.SCHEDULER_ENABLED ?? 'true') !== 'false') {
    startScheduler({ userId: user.id, profile });
  } else {
    console.log('[boot] scheduler disabled');
  }

  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => { console.log(`[boot] ${sig}, closing`); server.close(() => process.exit(0)); });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
