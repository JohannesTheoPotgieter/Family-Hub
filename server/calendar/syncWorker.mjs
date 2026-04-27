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
import {
  getCalendarConnection,
  recordSyncedAt,
  upsertCalendarConnection
} from './connectionStore.mjs';
import {
  fetchGoogleDelta,
  fetchMicrosoftDelta
} from './providerClients.mjs';
import { deleteExternalEvent, upsertExternalEvent } from './eventStore.mjs';
import { getSyncToken, setSyncToken } from './syncState.mjs';
import {
  normalizeGoogleEvent,
  normalizeMicrosoftEvent
} from '../../src/domain/calendar.ts';

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
  const connection = await getCalendarConnection({ familyId, memberId, provider: 'microsoft', encKey });
  if (!connection) {
    logger.log?.(`[sync] no microsoft connection for member ${memberId}; skipping.`);
    return { skipped: true };
  }
  const handleRefresh = (refreshed) =>
    upsertCalendarConnection({
      familyId,
      memberId,
      provider: 'microsoft',
      tokens: refreshed,
      encKey
    }).catch(() => {});

  let deltaLink = await getSyncToken({ familyId, memberId, provider: 'microsoft' });
  let processed = 0;
  let nextLink = null;

  do {
    const page = await fetchMicrosoftDelta({
      tokens: connection.tokens,
      deltaLink: nextLink ?? deltaLink,
      onTokensRefreshed: handleRefresh
    });
    processed += await reconcileMicrosoftPage({
      familyId,
      calendarConnectionId: connection.id,
      items: page.items
    });
    nextLink = page.nextLink;
    if (page.deltaLink) {
      deltaLink = page.deltaLink;
      await setSyncToken({ familyId, memberId, provider: 'microsoft', syncToken: deltaLink });
    }
  } while (nextLink);

  await recordSyncedAt({
    familyId,
    memberId,
    provider: 'microsoft',
    syncedAtIso: new Date().toISOString()
  });
  return { ok: true, processed };
};

const runGooglePush = async ({ familyId, memberId, encKey, logger }) => {
  const connection = await getCalendarConnection({ familyId, memberId, provider: 'google', encKey });
  if (!connection) return { skipped: true };

  const handleRefresh = (refreshed) =>
    upsertCalendarConnection({
      familyId,
      memberId,
      provider: 'google',
      tokens: refreshed,
      encKey
    }).catch(() => {});

  // Google supports multiple calendars per account; for now we sync the
  // primary. Multi-calendar selection is a Phase 5 enhancement.
  const calendarId = connection.accountLabel ?? 'primary';
  let syncToken = await getSyncToken({ familyId, memberId, provider: 'google' });
  let pageToken = null;
  let processed = 0;

  while (true) {
    const page = await fetchGoogleDelta({
      tokens: connection.tokens,
      calendarId,
      syncToken,
      pageToken,
      onTokensRefreshed: handleRefresh
    });
    if (page.resyncRequired) {
      logger.log?.(`[sync] google syncToken expired for ${memberId}; full resync.`);
      await setSyncToken({ familyId, memberId, provider: 'google', syncToken: null });
      syncToken = null;
      pageToken = null;
      continue; // restart from scratch with no syncToken
    }
    processed += await reconcileGooglePage({
      familyId,
      calendarConnectionId: connection.id,
      calendarId,
      items: page.items
    });
    if (!page.nextPageToken) {
      if (page.nextSyncToken) {
        await setSyncToken({
          familyId,
          memberId,
          provider: 'google',
          syncToken: page.nextSyncToken
        });
      }
      break;
    }
    pageToken = page.nextPageToken;
  }

  await recordSyncedAt({
    familyId,
    memberId,
    provider: 'google',
    syncedAtIso: new Date().toISOString()
  });
  return { ok: true, processed };
};

// --- Reconcilers ---------------------------------------------------------
//
// Each provider page is a list of raw provider events; we normalize via the
// existing domain helpers and route to upsert or delete based on the
// provider's signal (Google: status='cancelled'; Microsoft: @removed).

const reconcileGooglePage = async ({ familyId, calendarConnectionId, calendarId, items }) => {
  let count = 0;
  for (const raw of items) {
    if (raw.status === 'cancelled' && raw.id) {
      await deleteExternalEvent({ familyId, calendarConnectionId, externalId: raw.id });
      count += 1;
      continue;
    }
    if (!raw.id || !raw.start) continue;
    const normalized = normalizeGoogleEvent(raw, calendarId);
    await upsertExternalEvent({
      familyId,
      calendarConnectionId,
      normalized: {
        ...normalized,
        rruleText: Array.isArray(raw.recurrence) ? raw.recurrence.join('\n') : null,
        etag: raw.etag ?? null,
        lastModifiedRemote: raw.updated ?? null
      }
    });
    count += 1;
  }
  return count;
};

const reconcileMicrosoftPage = async ({ familyId, calendarConnectionId, items }) => {
  let count = 0;
  for (const raw of items) {
    if (raw['@removed'] && raw.id) {
      await deleteExternalEvent({ familyId, calendarConnectionId, externalId: raw.id });
      count += 1;
      continue;
    }
    if (!raw.id || !raw.start) continue;
    const normalized = normalizeMicrosoftEvent(raw, calendarConnectionId);
    await upsertExternalEvent({
      familyId,
      calendarConnectionId,
      normalized: {
        ...normalized,
        rruleText: raw.recurrence ? buildIcsFromGraphRecurrence(raw.recurrence) : null,
        etag: raw['@odata.etag'] ?? null,
        lastModifiedRemote: raw.lastModifiedDateTime ?? null
      }
    });
    count += 1;
  }
  return count;
};

const buildIcsFromGraphRecurrence = (recurrence) => {
  // Microsoft Graph returns a structured PatternedRecurrence object. Map
  // the common cases into RFC 5545 RRULE so expandRecurrence can read it
  // alongside Google's. Anything we can't map → null (the seed event still
  // shows up; recurrence simply isn't expanded server-side).
  const pattern = recurrence?.pattern;
  if (!pattern) return null;
  const parts = [];
  switch (pattern.type) {
    case 'daily':
      parts.push('FREQ=DAILY');
      break;
    case 'weekly':
      parts.push('FREQ=WEEKLY');
      if (Array.isArray(pattern.daysOfWeek) && pattern.daysOfWeek.length) {
        const map = { sunday: 'SU', monday: 'MO', tuesday: 'TU', wednesday: 'WE', thursday: 'TH', friday: 'FR', saturday: 'SA' };
        const days = pattern.daysOfWeek.map((d) => map[d.toLowerCase?.()]).filter(Boolean);
        if (days.length) parts.push(`BYDAY=${days.join(',')}`);
      }
      break;
    case 'absoluteMonthly':
      parts.push('FREQ=MONTHLY');
      if (pattern.dayOfMonth) parts.push(`BYMONTHDAY=${pattern.dayOfMonth}`);
      break;
    case 'absoluteYearly':
      parts.push('FREQ=YEARLY');
      break;
    default:
      return null;
  }
  if (pattern.interval && pattern.interval > 1) parts.push(`INTERVAL=${pattern.interval}`);
  const range = recurrence?.range;
  if (range?.numberOfOccurrences) parts.push(`COUNT=${range.numberOfOccurrences}`);
  if (range?.endDate) {
    const until = String(range.endDate).replace(/-/g, '') + 'T235959Z';
    parts.push(`UNTIL=${until}`);
  }
  return `RRULE:${parts.join(';')}`;
};

// Allow `node server/calendar/syncWorker.mjs` to start the worker directly.
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const worker = startCalendarSyncWorker();
  if (!worker) process.exit(0);
  process.on('SIGTERM', () => worker.close());
  process.on('SIGINT', () => worker.close());
}
