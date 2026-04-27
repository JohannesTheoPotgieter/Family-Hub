// Outbound mirror: write a Family-Hub event change through to the connected
// provider. Called by the routes after eventStore commits, fail-soft so a
// provider outage never blocks the local write — BullMQ's calendar-sync
// worker will retry the diff on the next poll.

import {
  deleteGoogleEvent,
  deleteMicrosoftEvent,
  upsertGoogleEvent,
  upsertMicrosoftEvent
} from './providerClients.mjs';
import { deleteCalDavEvent, upsertCalDavEvent } from './caldavClient.mjs';
import {
  getCalendarConnection,
  upsertCalendarConnection
} from './connectionStore.mjs';
import { recordEventSyncMetadata } from './eventStore.mjs';

const ENC_KEY = () => process.env.TOKEN_ENC_KEY;

/**
 * Push an event to the linked provider after a local create or update.
 * Records the new etag back on internal_events. Returns null if no
 * connection exists for this event.
 *
 * @param {{
 *   familyId: string,
 *   actorMemberId: string,
 *   memberId: string,
 *   event: import('../../src/domain/calendar.ts').NormalizedEvent & { etag?: string | null, calendarConnectionId?: string | null }
 * }} args
 */
export const mirrorEventUpsert = async ({ familyId, actorMemberId, memberId, event }) => {
  if (!event.calendarConnectionId) return null;

  // Pull the connection: we only know which provider via the row itself.
  const provider = await detectProvider({ familyId, memberId, connectionId: event.calendarConnectionId });
  if (!provider) return null;

  const connection = await getCalendarConnection({
    familyId,
    memberId,
    provider,
    encKey: ENC_KEY()
  });
  if (!connection) return null;

  const handleRefresh = (refreshed) =>
    upsertCalendarConnection({
      familyId,
      memberId,
      provider,
      tokens: refreshed,
      encKey: ENC_KEY()
    }).catch(() => {});

  let result;
  try {
    if (provider === 'google') {
      result = await upsertGoogleEvent({
        tokens: connection.tokens,
        calendarId: connection.accountLabel ?? 'primary',
        event,
        etag: event.etag ?? null,
        onTokensRefreshed: handleRefresh
      });
    } else if (provider === 'microsoft') {
      result = await upsertMicrosoftEvent({
        tokens: connection.tokens,
        event,
        etag: event.etag ?? null,
        onTokensRefreshed: handleRefresh
      });
    } else if (provider === 'caldav') {
      // accountLabel doubles as the CalDAV calendar URL — set during the
      // connection wizard. Future: support multiple calendar URLs per
      // connection via a side table.
      const calendarUrl = connection.accountLabel ?? '';
      result = await upsertCalDavEvent({
        tokens: connection.tokens,
        calendarUrl,
        event,
        etag: event.etag ?? null
      });
    } else {
      return null; // 'ics' is read-only by design (subscription URLs).
    }
  } catch (err) {
    // Best-effort. The next sync run reconciles.
    return { ok: false, error: err.message, status: err.status };
  }

  // Persist the new etag + remote id without writing an audit row. The
  // user-visible audit entry was the original 'event.created' /
  // 'event.updated' from eventStore; this is plumbing.
  await recordEventSyncMetadata({
    familyId,
    eventId: event.id,
    etag: result.etag ?? null,
    lastModifiedRemote: result.lastModifiedRemote ?? null,
    externalId: result.remoteId ?? null
  }).catch(() => {});

  return { ok: true, remoteId: result.remoteId };
};

/**
 * Push a delete to the linked provider.
 *
 * @param {{
 *   familyId: string,
 *   memberId: string,
 *   provider: 'google' | 'microsoft',
 *   externalId: string,
 *   calendarId?: string,
 *   etag?: string | null
 * }} args
 */
export const mirrorEventDelete = async ({ familyId, memberId, provider, externalId, calendarId, etag }) => {
  const connection = await getCalendarConnection({
    familyId,
    memberId,
    provider,
    encKey: ENC_KEY()
  });
  if (!connection) return null;
  const handleRefresh = (refreshed) =>
    upsertCalendarConnection({
      familyId,
      memberId,
      provider,
      tokens: refreshed,
      encKey: ENC_KEY()
    }).catch(() => {});

  try {
    if (provider === 'google') {
      await deleteGoogleEvent({
        tokens: connection.tokens,
        calendarId: calendarId ?? connection.accountLabel ?? 'primary',
        eventId: externalId,
        etag,
        onTokensRefreshed: handleRefresh
      });
    } else if (provider === 'microsoft') {
      await deleteMicrosoftEvent({
        tokens: connection.tokens,
        eventId: externalId,
        etag,
        onTokensRefreshed: handleRefresh
      });
    } else if (provider === 'caldav') {
      await deleteCalDavEvent({
        tokens: connection.tokens,
        calendarUrl: connection.accountLabel ?? '',
        eventId: externalId,
        etag
      });
    } else {
      return null;
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message, status: err.status };
  }
};

const detectProvider = async ({ familyId, memberId, connectionId }) => {
  // calendar_connections.provider is the source of truth — we just need to
  // read it. Use a tiny direct query (RLS scopes it).
  const { withFamilyContext } = await import('../db/pool.mjs');
  return withFamilyContext(familyId, async (client) => {
    const { rows } = await client.query(
      `SELECT provider FROM calendar_connections WHERE id = $1 AND member_id = $2`,
      [connectionId, memberId]
    );
    return rows[0]?.provider ?? null;
  });
};
