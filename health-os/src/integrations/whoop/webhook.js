// WHOOP webhook verification and dispatch.
//
// Signature scheme (from the WHOOP docs): prepend the timestamp header to the
// RAW request body, HMAC-SHA256 it with the app's client secret, base64 the
// result, and compare to the X-WHOOP-Signature header. The raw bytes matter -
// re-serialising the parsed JSON produces a different string and fails.

import crypto from 'node:crypto';
import { clientSecret } from './api.js';

export const SIGNATURE_HEADER = 'x-whoop-signature';
export const TIMESTAMP_HEADER = 'x-whoop-signature-timestamp';

// A delivery older than this is refused. WHOOP retries within minutes, and the
// webhook_events table already makes an accepted replay a no-op.
export const MAX_SKEW_MS = 15 * 60_000;

export function sign(timestamp, rawBody, secret = clientSecret()) {
  return crypto.createHmac('sha256', secret)
    .update(String(timestamp) + rawBody)
    .digest('base64');
}

/**
 * Verify a delivery. Returns { ok, reason }.
 * Comparison is timing-safe; a length mismatch short-circuits before the
 * compare because timingSafeEqual throws on unequal lengths.
 */
export function verify(headers, rawBody, { secret, now = Date.now() } = {}) {
  const provided = headers[SIGNATURE_HEADER] ?? headers[SIGNATURE_HEADER.toLowerCase()];
  const timestamp = headers[TIMESTAMP_HEADER] ?? headers[TIMESTAMP_HEADER.toLowerCase()];
  if (!provided || !timestamp) return { ok: false, reason: 'missing signature headers' };

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'bad timestamp header' };
  if (Math.abs(now - ts) > MAX_SKEW_MS) return { ok: false, reason: 'timestamp outside the accepted window' };

  let expected;
  try { expected = sign(timestamp, rawBody, secret ?? clientSecret()); }
  catch (e) { return { ok: false, reason: e.message }; }

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(provided), 'utf8');
  if (a.length !== b.length) return { ok: false, reason: 'signature mismatch' };
  if (!crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'signature mismatch' };
  return { ok: true, reason: null };
}

export const EVENT_TYPES = [
  'workout.updated', 'workout.deleted',
  'sleep.updated', 'sleep.deleted',
  'recovery.updated', 'recovery.deleted',
];

/** Shape check on the parsed body, so a malformed post is rejected cleanly. */
export function parseEvent(raw) {
  let body;
  try { body = JSON.parse(raw); } catch { return { ok: false, reason: 'body is not JSON' }; }
  if (!body || typeof body !== 'object') return { ok: false, reason: 'body is not an object' };
  const type = String(body.type ?? '');
  if (!EVENT_TYPES.includes(type)) return { ok: false, reason: `unknown event type "${type}"` };
  if (body.id === undefined || body.id === null) return { ok: false, reason: 'event has no id' };
  return {
    ok: true,
    event: {
      type,
      id: String(body.id),
      user_id: body.user_id != null ? String(body.user_id) : null,
      trace_id: body.trace_id ?? null,
      raw: body,
    },
  };
}
