// Calendar sync worker (Phase 1.5).
//
// One queue ('calendar-sync'), three job kinds:
//   poll-microsoft          for each member with a microsoft connection,
//                           fetch deltas via Graph and reconcile.
//   handle-google-push      Google sends push notifications to /api/calendar/
//                           webhooks/google; that route enqueues this job
//                           so processing happens off-request.
//   refresh-tokens          best-effort hourly refresh sweep.
//
// Each job opens its own withFamilyContext + transaction so RLS isolates
// tenants; the worker connection itself is shared.

import { buildWorker, getQueue, isQueuesConfigured } from '../queues/index.mjs';
import { getCalendarConnection, recordSyncedAt } from './connectionStore.mjs';

const QUEUE = 'calendar-sync';

export const enqueueMicrosoftPoll = async ({ familyId, memberId }) => {
  const queue = getQueue(QUEUE);
  if (!queue) return null;
  return queue.add(
    'poll-microsoft',
    { familyId, memberId },
    { jobId: `ms-poll-${familyId}-${memberId}`, removeOnComplete: 50, removeOnFail: 100 }
  );
};

export const enqueueGooglePush = async ({ familyId, memberId, channelId, resourceId }) => {
  const queue = getQueue(QUEUE);
  if (!queue) return null;
  return queue.add(
    'handle-google-push',
    { familyId, memberId, channelId, resourceId },
    { removeOnComplete: 50, removeOnFail: 100 }
  );
};

/**
 * Long-running worker entrypoint. Use:
 *   node server/calendar/syncWorker.mjs
 * to start. Returns the Worker instance for callers that want to attach
 * shutdown hooks (e.g. SIGTERM in a Fly.io machine).
 */
export const startCalendarSyncWorker = ({ logger = console } = {}) => {
  if (!isQueuesConfigured()) {
    logger.log?.('[sync] REDIS_URL not set; calendar sync worker not started.');
    return null;
  }
  const encKey = process.env.TOKEN_ENC_KEY;

  const worker = buildWorker(QUEUE, async (job) => {
    const { familyId, memberId } = job.data;
    if (job.name === 'poll-microsoft') {
      return runMicrosoftPoll({ familyId, memberId, encKey, logger });
    }
    if (job.name === 'handle-google-push') {
      return runGooglePush({ familyId, memberId, encKey, logger });
    }
    logger.warn?.(`[sync] unknown job kind: ${job.name}`);
  });
  if (!worker) return null;

  worker.on('failed', (job, err) => {
    logger.error?.(`[sync] job ${job?.id} failed: ${err?.message}`);
  });
  return worker;
};

// --- Job handlers --------------------------------------------------------
//
// These intentionally don't ship full Google/Microsoft API bindings — that
// belongs in slice 5's provider clients. They orchestrate: fetch the
// connection, call the provider client, record sync timestamps. Until the
// real client lands, the handlers are no-ops that record the timestamp so
// the queue plumbing is reviewable now.

const runMicrosoftPoll = async ({ familyId, memberId, encKey, logger }) => {
  const connection = await getCalendarConnection({
    familyId,
    memberId,
    provider: 'microsoft',
    encKey
  });
  if (!connection) {
    logger.log?.(`[sync] no microsoft connection for member ${memberId}; skipping.`);
    return { skipped: true };
  }

  // TODO(slice 5): call providerClients.microsoft.fetchDelta(connection.tokens, since)
  // → upsert via eventStore.updateEvent / createEvent / deleteEvent with
  //   the provider's etag/lastModifiedDateTime carried through.
  logger.log?.(`[sync] poll-microsoft stub for ${memberId}`);

  await recordSyncedAt({
    familyId,
    memberId,
    provider: 'microsoft',
    syncedAtIso: new Date().toISOString()
  });
  return { ok: true };
};

const runGooglePush = async ({ familyId, memberId, encKey, logger }) => {
  const connection = await getCalendarConnection({
    familyId,
    memberId,
    provider: 'google',
    encKey
  });
  if (!connection) return { skipped: true };

  // TODO(slice 5): call providerClients.google.fetchSyncToken(connection.tokens)
  // → upsert events the same way.
  logger.log?.(`[sync] google-push stub for ${memberId}`);

  await recordSyncedAt({
    familyId,
    memberId,
    provider: 'google',
    syncedAtIso: new Date().toISOString()
  });
  return { ok: true };
};

// Allow `node server/calendar/syncWorker.mjs` to start the worker directly.
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const worker = startCalendarSyncWorker();
  if (!worker) process.exit(0);
  process.on('SIGTERM', () => worker.close());
  process.on('SIGINT', () => worker.close());
}
