// WHOOP REST client.
//
// Endpoints, scopes and limits come from the published OpenAPI spec at
// https://api.prod.whoop.com/developer/doc/openapi.json - not from memory.
// v1 is retired; everything here is v2.

export const API_BASE = 'https://api.prod.whoop.com/developer';
export const AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
export const TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';

// `offline` is not optional: without it WHOOP returns no refresh token and the
// connection dies an hour after it is made.
export const SCOPES = [
  'offline',
  'read:recovery',
  'read:cycles',
  'read:sleep',
  'read:workout',
  'read:profile',
  'read:body_measurement',
];

// The spec caps `limit` at 25. Asking for more is a 400, not a silent clamp.
export const PAGE_LIMIT = 25;

export function clientId() {
  const v = process.env.WHOOP_CLIENT_ID;
  if (!v) throw new Error('WHOOP_CLIENT_ID is not set');
  return v;
}
export function clientSecret() {
  const v = process.env.WHOOP_CLIENT_SECRET;
  if (!v) throw new Error('WHOOP_CLIENT_SECRET is not set');
  return v;
}
export function redirectUri() {
  const base = process.env.PUBLIC_BASE_URL;
  if (!base) throw new Error('PUBLIC_BASE_URL is not set');
  return `${base.replace(/\/$/, '')}/whoop/callback`;
}

export function isConfigured() {
  return Boolean(process.env.WHOOP_CLIENT_ID && process.env.WHOOP_CLIENT_SECRET && process.env.PUBLIC_BASE_URL);
}

/* ------------------------------------------------------------------ oauth --- */

export function authorizeUrl(state) {
  const q = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: SCOPES.join(' '),
    state,
  });
  return `${AUTH_URL}?${q}`;
}

async function tokenRequest(body) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`whoop token ${res.status}: ${text.slice(0, 300)}`);
  const json = JSON.parse(text);
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? null,
    expires_at: new Date(Date.now() + (Number(json.expires_in ?? 3600) - 60) * 1000),
    scopes: json.scope ?? SCOPES.join(' '),
  };
}

export function exchangeCode(code) {
  return tokenRequest({
    grant_type: 'authorization_code',
    code,
    client_id: clientId(),
    client_secret: clientSecret(),
    redirect_uri: redirectUri(),
  });
}

/**
 * Refresh tokens ROTATE: the old one is invalidated the moment this succeeds,
 * so the caller must persist the new pair before the next request. `scope` is
 * required here even though it looks redundant.
 */
export function refreshToken(token) {
  return tokenRequest({
    grant_type: 'refresh_token',
    refresh_token: token,
    client_id: clientId(),
    client_secret: clientSecret(),
    scope: 'offline',
  });
}

/* ------------------------------------------------------------------ calls --- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * A client bound to a token store.
 *
 * `store` is `{ get(): Promise<{access_token, refresh_token}>, save(tokens): Promise<void> }`.
 * A 401 triggers exactly one refresh-and-retry; a second 401 is a real failure
 * and surfaces, rather than looping against a revoked grant.
 */
export function createClient(store, { fetchImpl = fetch } = {}) {
  let tokens = null;

  async function current() {
    if (!tokens) tokens = await store.get();
    if (!tokens?.access_token) throw new Error('WHOOP is not connected');
    return tokens;
  }

  async function doRefresh() {
    const t = await current();
    if (!t.refresh_token) throw new Error('WHOOP connection has no refresh token - reconnect');
    const next = await refreshToken(t.refresh_token);
    // Keep the previous refresh token if WHOOP omitted a new one.
    tokens = { ...next, refresh_token: next.refresh_token ?? t.refresh_token };
    await store.save(tokens);
    return tokens;
  }

  async function request(path, params = {}, { retried = false, attempt = 0 } = {}) {
    const t = await current();
    const url = new URL(API_BASE + path);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }

    const res = await fetchImpl(url, {
      headers: { authorization: `Bearer ${t.access_token}`, accept: 'application/json' },
    });

    if (res.status === 401 && !retried) {
      await doRefresh();
      return request(path, params, { retried: true, attempt });
    }

    if (res.status === 429 && attempt < 3) {
      // 100 req/min, 10k/day. Honour the reset header when it is present.
      const reset = Number(res.headers.get('x-ratelimit-reset'));
      const waitMs = Number.isFinite(reset) && reset > 0
        ? Math.min(reset * 1000, 60_000)
        : 2 ** attempt * 1000;
      await sleep(waitMs);
      return request(path, params, { retried, attempt: attempt + 1 });
    }

    if (res.status === 404) return null;

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`whoop ${path} ${res.status}: ${body.slice(0, 300)}`);
    }

    return res.json();
  }

  /** Walk a paginated collection to the end (or to `max` records). */
  async function collect(path, params = {}, { max = 1000 } = {}) {
    const out = [];
    let nextToken;
    do {
      const page = await request(path, { ...params, limit: PAGE_LIMIT, nextToken });
      if (!page) break;
      out.push(...(page.records ?? []));
      nextToken = page.next_token ?? null;
      if (out.length >= max) break;
      if (nextToken) await sleep(120); // stay well inside 100/min on a long backfill
    } while (nextToken);
    return out.slice(0, max);
  }

  return {
    request,
    collect,
    refresh: doRefresh,
    profile: () => request('/v2/user/profile/basic'),
    body: () => request('/v2/user/measurement/body'),
    recoveries: (range) => collect('/v2/recovery', range),
    sleeps: (range) => collect('/v2/activity/sleep', range),
    workouts: (range) => collect('/v2/activity/workout', range),
    cycles: (range) => collect('/v2/cycle', range),
    sleepById: (id) => request(`/v2/activity/sleep/${id}`),
    workoutById: (id) => request(`/v2/activity/workout/${id}`),
    recoveryForCycle: (cycleId) => request(`/v2/cycle/${cycleId}/recovery`),
  };
}
