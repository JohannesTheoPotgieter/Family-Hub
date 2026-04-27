// Push subscription storage (Phase 0.9 — replaces the slice 1 stub).
//
// One row per (member, endpoint). Endpoint is unique per device per browser
// per VAPID key, so we UPSERT on it; re-subscribing the same device just
// refreshes the keys + family_id.
//
// The schema for `push_subscriptions` lives in a follow-up tiny migration
// (0003_push_subscriptions.sql) so this Phase 0 slice doesn't muddy 0001's
// initial cut.

import { withFamilyContext } from '../db/pool.mjs';

/**
 * @param {{
 *   familyId: string,
 *   memberId: string,
 *   subscription: {
 *     endpoint: string,
 *     keys: { p256dh: string, auth: string },
 *     expirationTime?: number | null
 *   }
 * }} args
 */
export const savePushSubscription = async ({ familyId, memberId, subscription }) => {
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    const err = new Error('invalid push subscription payload');
    err.status = 400;
    throw err;
  }
  return withFamilyContext(familyId, async (client) => {
    await client.query(
      `INSERT INTO push_subscriptions (family_id, member_id, endpoint, p256dh, auth, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (endpoint) DO UPDATE SET
         family_id = EXCLUDED.family_id,
         member_id = EXCLUDED.member_id,
         p256dh    = EXCLUDED.p256dh,
         auth      = EXCLUDED.auth,
         expires_at = EXCLUDED.expires_at,
         updated_at = now()`,
      [
        familyId,
        memberId,
        subscription.endpoint,
        subscription.keys.p256dh,
        subscription.keys.auth,
        subscription.expirationTime ? new Date(subscription.expirationTime).toISOString() : null
      ]
    );
  });
};

export const listPushSubscriptionsForMember = async ({ familyId, memberId }) =>
  withFamilyContext(familyId, async (client) => {
    const { rows } = await client.query(
      `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE member_id = $1`,
      [memberId]
    );
    return rows.map((r) => ({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }));
  });

export const deleteExpiredSubscription = async ({ familyId, endpoint }) =>
  withFamilyContext(familyId, async (client) => {
    await client.query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [endpoint]);
  });
