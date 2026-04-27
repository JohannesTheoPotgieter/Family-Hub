// Tiny forward-only migration runner.
//
// Walks server/db/migrations/*.sql in lexical order, tracks applied files in
// `schema_migrations`, and applies any new ones inside their own transaction.
// Each .sql file is expected to be self-contained (BEGIN/COMMIT inside is
// optional — we wrap regardless).
//
// Usage:
//   node server/db/migrate.mjs               # apply pending
//   node server/db/migrate.mjs --status      # print state, exit 0
//
// This is deliberately small. When the project graduates to Drizzle Kit,
// we'll generate migrations and replace this runner — but the table name
// (`schema_migrations`) stays so the cutover is non-destructive.

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getPool } from './pool.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, 'migrations');

const ensureMigrationsTable = async (client) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
};

const listMigrationFiles = async () => {
  const entries = await readdir(MIGRATIONS_DIR);
  return entries.filter((name) => name.endsWith('.sql')).sort();
};

const listApplied = async (client) => {
  const { rows } = await client.query('SELECT version FROM schema_migrations ORDER BY version');
  return new Set(rows.map((r) => r.version));
};

export const migrationStatus = async () => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    const all = await listMigrationFiles();
    const applied = await listApplied(client);
    return {
      applied: all.filter((f) => applied.has(f)),
      pending: all.filter((f) => !applied.has(f))
    };
  } finally {
    client.release();
  }
};

export const runMigrations = async ({ logger = console } = {}) => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    const all = await listMigrationFiles();
    const applied = await listApplied(client);

    for (const file of all) {
      if (applied.has(file)) continue;
      logger.log?.(`[migrate] applying ${file}`);
      const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
        await client.query('COMMIT');
        logger.log?.(`[migrate] ✓ ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error?.(`[migrate] ✗ ${file}: ${err.message}`);
        throw err;
      }
    }
  } finally {
    client.release();
  }
};

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const status = process.argv.includes('--status');
  if (status) {
    migrationStatus()
      .then((s) => {
        console.log(JSON.stringify(s, null, 2));
        process.exit(0);
      })
      .catch((err) => {
        console.error(err);
        process.exit(1);
      });
  } else {
    runMigrations()
      .then(() => process.exit(0))
      .catch((err) => {
        console.error(err);
        process.exit(1);
      });
  }
}
