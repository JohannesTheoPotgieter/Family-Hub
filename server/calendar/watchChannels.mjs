// Google watch-channel lifecycle (Phase 1.5 closeout).
//
// When a member connects their Google calendar we mint a short-lived watch
// channel pointing at /api/calendar/webhooks/google. Google pushes
// notifications when events change; the webhook handler dispatches a
// `handle-google-push` job which calls runGooglePush via the existing
// delta-fetch flow (no full re-scan).
//
// Channels expire after 7 days max. A scheduled job (cron via Fly machines
// or a recurring BullMQ job) re-establishes them; renewing in-place isn't
// supported by the API so we always stop + recreate.

import { randomUUID } from 'node:crypto';
import { getCalendarConnection, upsertCalendarConnection } from './connectionStore.mjs';
import { stopGoogleChannel, watchGoogleCalendar } from './providerClients.mjs';
import { setWatchChannel } from './syncState.mjs';

const webhookUrl = () => {
  const base = (process.env.PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  if (!base) throw new Error('PUBLIC_APP_URL is required to register a Google watch channel.');
  return `${base}/api/calendar/webhooks/google`;
};

/**
 * Establish (or rotate) the Google watch channel for a member's primary
 * calendar. Stores the new channelId, resourceId, and expiresAt on the
 * calendar_connections row. Stops any prior channel first so we never
 * leak active subscriptions.
 *
 * @param {{ familyId: string, memberId: string, encKey: string }} args
 */
export const ensureGoogleWatchChannel = async ({ familyId, memberId, encKey }) => {
  const connection = await getCalendarConnection({
    familyId,
    memberId,
    provider: 'google',
    encKey
  });
  if (!connection) return null;

  const handleRefresh = (refreshed) =>
    upsertCalendarConnection({
      familyId,
      memberId,
      provider: 'google',
      tokens: refreshed,
      encKey
    }).catch(() => {});

  // Best-effort stop of the previous channel; ignore failures because the
  // old channel may already have expired.
  if (connection.tokens && connection.id) {
    const { withFamilyContext } = await import('../db/pool.mjs');
    const prior = await withFamilyContext(familyId, async (client) => {
      const { rows } = await client.query(
        `SELECT sync_channel_id, sync_resource_id FROM calendar_connections WHERE id = $1`,
        [connection.id]
      );
      return rows[0] ?? null;
    });
    if (prior?.sync_channel_id && prior?.sync_resource_id) {
      await stopGoogleChannel({
        tokens: connection.tokens,
        channelId: prior.sync_channel_id,
        resourceId: prior.sync_resource_id,
        onTokensRefreshed: handleRefresh
      }).catch(() => {});
    }
  }

  const channelId = `fh-${randomUUID()}`;
  const result = await watchGoogleCalendar({
    tokens: connection.tokens,
    calendarId: connection.accountLabel ?? 'primary',
    webhookUrl: webhookUrl(),
    channelId,
    token: process.env.GOOGLE_WATCH_TOKEN ?? channelId,
    onTokensRefreshed: handleRefresh
  });

  await setWatchChannel({
    familyId,
    memberId,
    provider: 'google',
    channelId: result.channelId,
    resourceId: result.resourceId,
    expiresAt: result.expiration ? new Date(result.expiration).toISOString() : null
  });

  return result;
};
