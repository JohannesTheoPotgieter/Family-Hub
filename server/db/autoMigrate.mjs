// Auto-migrate on server boot (Replit / soft-launch friendly).
//
// When DATABASE_URL is set, run any pending migrations once before the
// HTTP server starts accepting requests. The migration runner is
// idempotent — already-applied files are skipped — so calling this on
// every boot is safe.
//
// Disable via AUTO_MIGRATE=false (e.g. in environments where you want
// migrations to be a deliberate manual step).

import { isPoolConfigured } from './pool.mjs';
import { runMigrations } from './migrate.mjs';

export const autoMigrateIfEnabled = async ({ logger = console } = {}) => {
  if (!isPoolConfigured()) {
    logger.log?.('[boot] DATABASE_URL not set; skipping auto-migrate.');
    return { ran: false, reason: 'no_database_url' };
  }
  if (process.env.AUTO_MIGRATE === 'false') {
    logger.log?.('[boot] AUTO_MIGRATE=false; skipping auto-migrate.');
    return { ran: false, reason: 'disabled' };
  }
  try {
    await runMigrations({ logger });
    return { ran: true };
  } catch (err) {
    logger.error?.(`[boot] auto-migrate failed: ${err.message}`);
    return { ran: false, reason: 'failed', error: err.message };
  }
};
