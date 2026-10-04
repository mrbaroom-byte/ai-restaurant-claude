#!/usr/bin/env node
// Applies sql/*.sql in filename order. Each file is idempotent (create if not
// exists), so re-running is safe.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, closePool } from './db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const sqlDir = path.join(here, '..', 'sql');

export async function migrate() {
  const files = fs.readdirSync(sqlDir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    process.stdout.write(`applying ${f} ... `);
    await query(fs.readFileSync(path.join(sqlDir, f), 'utf8'));
    console.log('ok');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate()
    .then(() => console.log('migrations complete'))
    .catch((e) => { console.error(e.message); process.exitCode = 1; })
    .finally(closePool);
}
