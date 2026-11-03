// The three HTTP endpoints WHOOP needs: start the OAuth dance, receive the
// callback, and take webhook deliveries.

import crypto from 'node:crypto';
import * as repo from '../../repo/index.js';
import { loadProfile } from '../../profile.js';
import * as tg from '../../channels/telegram.js';
import { L } from '../../bot/strings.js';
import { resolveLang } from '../../bot/lang.js';
import { authorizeUrl, exchangeCode, isConfigured } from './api.js';
import { verify, parseEvent } from './webhook.js';
import { connect, handleEvent, syncRecent, PROVIDER } from './sync.js';

const STATE_KEY = 'whoop_oauth_state';
const STATE_TTL_MS = 10 * 60_000;

function page(title, body, tone = 'ok') {
  const accent = tone === 'ok' ? '#007871' : '#A4442F';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${title}</title>
<style>
  body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#E9E6DE;color:#1C2321;
       font:16px/1.55 ui-sans-serif,system-ui,sans-serif;padding:24px}
  @media (prefers-color-scheme: dark){body{background:#14181A;color:#E9E6DE}.card{background:#1C2224;border-color:#333A3C}}
  .card{max-width:420px;background:#F3F1EB;border:1px solid #C6C2B6;border-radius:14px;padding:28px}
  h1{font-size:19px;margin:0 0 10px;color:${accent}}
  p{margin:0 0 8px}
  code{font-family:ui-monospace,monospace;font-size:13px}
</style></head><body><div class="card"><h1>${title}</h1>${body}</div></body></html>`;
}

/** Returns true when it handled the request. */
export async function handleWhoopRoute(req, res, url, { userId, send }) {
  if (url.pathname === '/whoop/connect' && req.method === 'GET') {
    // Guarded by the dashboard token: this link starts an account linkage and
    // must not be something a stranger can trigger.
    if (!process.env.DASHBOARD_TOKEN || url.searchParams.get('token') !== process.env.DASHBOARD_TOKEN) {
      return send(res, 401, 'unauthorized'), true;
    }
    if (!isConfigured()) {
      return send(res, 500, page('Not configured',
        '<p>Set <code>WHOOP_CLIENT_ID</code>, <code>WHOOP_CLIENT_SECRET</code> and '
        + '<code>PUBLIC_BASE_URL</code>, then reload.</p>', 'bad'), 'text/html; charset=utf-8'), true;
    }
    const state = crypto.randomBytes(24).toString('base64url');
    await repo.settings.set(userId, STATE_KEY, { state, at: Date.now() });
    res.writeHead(302, { location: authorizeUrl(state), 'cache-control': 'no-store' });
    res.end();
    return true;
  }

  if (url.pathname === '/whoop/callback' && req.method === 'GET') {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    if (error) {
      return send(res, 400, page('WHOOP declined', `<p>${escapeHtml(error)}</p>`, 'bad'),
        'text/html; charset=utf-8'), true;
    }

    const stored = await repo.settings.get(userId, STATE_KEY, null);
    await repo.settings.set(userId, STATE_KEY, null);
    if (!code || !state || !stored?.state || stored.state !== state) {
      return send(res, 400, page('Could not verify the request',
        '<p>The state parameter did not match. Start again from <code>/whoop/connect</code>.</p>', 'bad'),
        'text/html; charset=utf-8'), true;
    }
    if (Date.now() - Number(stored.at ?? 0) > STATE_TTL_MS) {
      return send(res, 400, page('That link expired',
        '<p>Start again from <code>/whoop/connect</code>.</p>', 'bad'),
        'text/html; charset=utf-8'), true;
    }

    try {
      const tokens = await exchangeCode(code);
      const me = await connect(userId, tokens);
      send(res, 200, page('WHOOP connected',
        `<p>Linked to WHOOP user <code>${escapeHtml(String(me?.user_id ?? 'unknown'))}</code>.</p>`
        + '<p>Recovery, sleep and workouts will now arrive on their own. '
        + 'Run <code>/whoop backfill</code> in Telegram to import your history.</p>'),
        'text/html; charset=utf-8');

      // Pull the last couple of days straight away so the next brief has data.
      const profile = loadProfile();
      syncRecent(userId, profile).then(async (r) => {
        const t = L(await resolveLang(userId, profile));
        await tg.sendMessage(`⌚ ${t('whoopConnected')}\n${t('whoopSynced', {
          r: r.recoveries, s: r.sleeps, w: r.workouts,
        })}`).catch(() => {});
      }).catch((e) => console.error('[whoop] initial sync failed', e.message));
    } catch (e) {
      console.error('[whoop] callback failed', e);
      send(res, 500, page('Connection failed', `<p>${escapeHtml(e.message)}</p>`, 'bad'),
        'text/html; charset=utf-8');
    }
    return true;
  }

  if (url.pathname === '/whoop/webhook' && req.method === 'POST') {
    // The raw body is read by the caller and handed over untouched - the
    // signature is over the exact bytes, not over a re-serialised object.
    const raw = await req.rawBody;
    const check = verify(req.headers, raw);
    if (!check.ok) {
      console.warn('[whoop] rejected webhook:', check.reason);
      return send(res, 401, check.reason), true;
    }

    const parsed = parseEvent(raw);
    if (!parsed.ok) {
      // Signed but unusable: acknowledge so WHOOP stops retrying, and record it.
      console.warn('[whoop] unusable webhook:', parsed.reason);
      return send(res, 200, 'ignored'), true;
    }

    // Acknowledge before doing the work: WHOOP retries anything slow, and a
    // re-fetch plus a database write is slower than a webhook timeout.
    send(res, 200, 'ok');
    processEvent(userId, parsed.event).catch((e) => console.error('[whoop] event failed', e));
    return true;
  }

  return false;
}

async function processEvent(userId, event) {
  const stored = await repo.webhookEvents.record(userId, {
    provider: PROVIDER,
    event_type: event.type,
    external_id: event.id,
    trace_id: event.trace_id,
    payload: event.raw,
  });
  // A null row means this exact delivery was already stored - a retry.
  if (!stored) return;

  const profile = loadProfile();
  try {
    const out = await handleEvent(userId, profile, event);
    await repo.webhookEvents.finish(stored.id, out.action === 'ignored' ? 'ignored' : 'ok',
      JSON.stringify(out).slice(0, 400));
    await notify(userId, profile, event, out);
  } catch (e) {
    await repo.webhookEvents.finish(stored.id, 'error', e.message);
    throw e;
  }
}

/**
 * Speak up only when there is something to say: a suspect reading, or a session
 * that just landed. Silence is the default - a chat that pings on every
 * upstream rescoring gets muted, and then the useful messages go with it.
 */
async function notify(userId, profile, event, out) {
  const t = L(await resolveLang(userId, profile));
  const warnings = (out.warnings ?? []).filter(Boolean);

  if (warnings.length) {
    await tg.sendMessage(`⚠️ ${t('whoopSuspect')}\n${warnings.map((w) => `• ${w}`).join('\n')}`).catch(() => {});
    return;
  }
  if (event.type === 'workout.updated' && out.action === 'created') {
    const mins = out.zoneMethod === 'avg_hr_outside' ? t('whoopNoZone2') : '';
    await tg.sendMessage(`⌚ ${t('whoopWorkout', { d: out.date })} ${mins}`.trim()).catch(() => {});
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
