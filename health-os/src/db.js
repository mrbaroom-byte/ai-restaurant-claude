import pg from 'pg';

// Postgres returns numerics as strings to avoid precision loss. Every numeric
// in this schema is small enough for a JS number, and the whole codebase
// assumes numbers, so parse them once here instead of at 40 call sites.
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
// DATE -> keep the 'YYYY-MM-DD' string; local calendar dates are not instants.
pg.types.setTypeParser(1082, (v) => v);
// int8 (bigserial ids) -> Number. Node-postgres returns these as strings to be
// safe above 2^53; every id here is a row counter on a single-user database,
// and a string id silently breaks `id === Number(x)` comparisons.
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));

let pool = null;

export function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const useSsl = String(process.env.DATABASE_SSL ?? 'true') !== 'false';
  pool = new pg.Pool({
    connectionString,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on('error', (err) => console.error('[db] idle client error', err.message));
  return pool;
}

export async function query(text, params = []) {
  const res = await getPool().query(text, params);
  return res.rows;
}

export async function one(text, params = []) {
  const rows = await query(text, params);
  return rows[0] ?? null;
}

export async function tx(fn) {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (pool) { await pool.end(); pool = null; }
}
