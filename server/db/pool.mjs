// Postgres connection pool (Phase 0.1 + 0.4 wiring).
//
// The pool is created lazily on first use and read from env vars:
//   DATABASE_URL    e.g. postgres://user:pass@host:5432/db?sslmode=require
//   PGSSLMODE       optional (Neon: require)
//
// `withFamilyContext(familyId, fn)` checks out a client, sets the
// `app.current_family_id` GUC, runs `fn(client)`, and releases. Every RLS
// policy in 0002_rls.sql keys off this GUC, so every tenant query MUST go
// through this helper.
//
// `withTransaction(client, fn)` wraps a callback in BEGIN/COMMIT/ROLLBACK.
// Use it when applying a proposal, importing local state, or anywhere
// else where multiple writes must succeed or fail together.

import pg from 'pg';

let pool = null;

const buildPool = () => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. The DB pool is required for any tenant-scoped route. ' +
        'See docs/phase-0-runbook.md.'
    );
  }
  const sslmode = process.env.PGSSLMODE;
  return new pg.Pool({
    connectionString: url,
    ssl: sslmode === 'disable' ? false : { rejectUnauthorized: false },
    max: Number(process.env.PGPOOL_MAX ?? 10)
  });
};

export const getPool = () => {
  if (!pool) pool = buildPool();
  return pool;
};

export const isPoolConfigured = () => Boolean(process.env.DATABASE_URL);

/**
 * Run `fn(client)` with `app.current_family_id` set so RLS policies scope
 * every query to the active tenant. Releases the client back to the pool on
 * exit, even on error.
 */
export const withFamilyContext = async (familyId, fn) => {
  if (!familyId || typeof familyId !== 'string') {
    throw new Error('withFamilyContext requires a non-empty familyId.');
  }
  const client = await getPool().connect();
  try {
    // set_config(..., is_local=false) is SESSION-scoped on purpose: fn(client)
    // is not always inside a transaction, and a transaction-local GUC would
    // evaporate before the queries run. Parameter binding keeps a malicious
    // familyId from escaping.
    await client.query("SELECT set_config('app.current_family_id', $1, false)", [familyId]);
    return await fn(client);
  } finally {
    // Reset the GUC before returning the client to the pool so a subsequent
    // checkout doesn't inherit this caller's tenant id. If the reset itself
    // fails, the connection is poisoned — destroy it rather than letting the
    // next tenant query run under our family_id.
    try {
      await client.query("SELECT set_config('app.current_family_id', '', false)");
      client.release();
    } catch (resetErr) {
      client.release(resetErr instanceof Error ? resetErr : new Error('failed to reset tenant GUC'));
    }
  }
};

/**
 * Wrap `fn` in a Postgres transaction. The client must already have been
 * checked out (e.g. from `withFamilyContext`). Rolls back on throw.
 */
export const withTransaction = async (client, fn) => {
  await client.query('BEGIN');
  try {
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // best-effort
    }
    throw err;
  }
};

export const closePool = async () => {
  if (pool) {
    await pool.end();
    pool = null;
  }
};
