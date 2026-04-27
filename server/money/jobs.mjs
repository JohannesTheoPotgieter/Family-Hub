// Money-side scheduled jobs (Phase 4.7 + 4.8 + 4.5).
//
// Three queues + workers:
//   net-worth-snapshot     weekly per-family snapshot. Cron: Mondays 02:00 UTC.
//   fx-snapshot            daily FX rate fetch (single shared row, not
//                          per-family). Cron: 00:30 UTC.
//   bank-sync              imported via banking/syncWorker.mjs.
//
// All cron jobs honour the same fail-soft pattern: when REDIS_URL isn't
// set the start* functions log + return null.

import { buildWorker, getQueue, isQueuesConfigured } from '../queues/index.mjs';
import { getPool } from '../db/pool.mjs';
import { snapshotNetWorth } from './insights.mjs';
import { snapshotRates } from './fxRates.mjs';

// --- Net worth ----------------------------------------------------------

const NW_QUEUE = 'net-worth-snapshot';

export const ensureNetWorthSchedule = async () => {
  const queue = getQueue(NW_QUEUE);
  if (!queue) return null;
  const existing = await queue.getRepeatableJobs();
  if (existing.some((j) => j.name === 'sweep')) return null;
  return queue.add(
    'sweep',
    {},
    { repeat: { pattern: '0 2 * * 1' }, removeOnComplete: 50, removeOnFail: 100 }
  );
};

export const runNetWorthSweep = async ({ logger = console } = {}) => {
  const pool = getPool();
  const { rows } = await pool.query(`SELECT id FROM families`);
  let snapshotted = 0;
  for (const { id } of rows) {
    try {
      await snapshotNetWorth({ familyId: id });
      snapshotted += 1;
    } catch (err) {
      logger.error?.(`[net-worth] family ${id}: ${err.message}`);
    }
  }
  return { snapshotted };
};

export const startNetWorthWorker = ({ logger = console } = {}) => {
  if (!isQueuesConfigured()) return null;
  const worker = buildWorker(NW_QUEUE, async () => runNetWorthSweep({ logger }));
  return worker;
};

// --- FX snapshot --------------------------------------------------------

const FX_QUEUE = 'fx-snapshot';

export const ensureFxSchedule = async () => {
  const queue = getQueue(FX_QUEUE);
  if (!queue) return null;
  const existing = await queue.getRepeatableJobs();
  if (existing.some((j) => j.name === 'fetch')) return null;
  return queue.add(
    'fetch',
    { base: 'ZAR', quotes: ['USD', 'EUR', 'GBP'] },
    { repeat: { pattern: '30 0 * * *' }, removeOnComplete: 30, removeOnFail: 100 }
  );
};

export const startFxWorker = ({ logger = console } = {}) => {
  if (!isQueuesConfigured()) return null;
  const worker = buildWorker(FX_QUEUE, async (job) => {
    try {
      return await snapshotRates(job.data ?? {});
    } catch (err) {
      logger.error?.(`[fx] snapshot failed: ${err.message}`);
      throw err;
    }
  });
  return worker;
};
