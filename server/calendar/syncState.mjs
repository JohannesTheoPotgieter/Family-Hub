// Per-connection sync cursor + watch-channel persistence (Phase 1.5).
//
// Google: stores the `nextSyncToken` from events.list. Resync (full re-scan)
// is triggered by a 410 Gone response which clears the token.
// Microsoft: stores the @odata.deltaLink URL.

import { withFamilyContext } from '../db/pool.mjs';

export const getSyncToken = async ({ familyId, memberId, provider }) =>
  withFamilyContext(familyId, async (client) => {
    const { rows } = await client.query(
      `SELECT sync_token FROM calendar_connections
        WHERE member_id = $1 AND provider = $2
        LIMIT 1`,
      [memberId, provider]
    );
    return rows[0]?.sync_token ?? null;
  });

export const setSyncToken = async ({ familyId, memberId, provider, syncToken }) =>
  withFamilyContext(familyId, async (client) => {
    await client.query(
      `UPDATE calendar_connections
          SET sync_token = $3
        WHERE member_id = $1 AND provider = $2`,
      [memberId, provider, syncToken]
    );
  });

export const setWatchChannel = async ({ familyId, memberId, provider, channelId, resourceId, expiresAt }) =>
  withFamilyContext(familyId, async (client) => {
    await client.query(
      `UPDATE calendar_connections
          SET sync_channel_id = $3,
              sync_resource_id = $4,
              sync_channel_expires_at = $5
        WHERE member_id = $1 AND provider = $2`,
      [memberId, provider, channelId, resourceId, expiresAt]
    );
  });

export const findConnectionByChannelId = async (channelId) => {
  // Channel id is unique across the system so we can scan connections
  // outside any tenant context to dispatch webhook calls. Use a fresh
  // unbinded client.
  const { getPool } = await import('../db/pool.mjs');
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, family_id, member_id, provider FROM calendar_connections
      WHERE sync_channel_id = $1 LIMIT 1`,
    [channelId]
  );
  return rows[0]
    ? {
        id: rows[0].id,
        familyId: rows[0].family_id,
        memberId: rows[0].member_id,
        provider: rows[0].provider
      }
    : null;
};
