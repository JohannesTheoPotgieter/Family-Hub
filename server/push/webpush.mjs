// Web Push send (Phase 0.9 + groundwork for Phase 3.9 proposal action buttons).
//
// VAPID config from env:
//   VAPID_PUBLIC_KEY
//   VAPID_PRIVATE_KEY
//   VAPID_SUBJECT  (mailto:ops@family-hub.app)
//
// Generate a fresh keypair with: `npx web-push generate-vapid-keys`.
//
// Fail-soft when keys aren't set: sendPush returns {ok:false,reason} instead
// of throwing so callers can degrade to in-app-only notifications.

import webpush from 'web-push';

let configured = false;

const ensureConfigured = () => {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!pub || !priv || !subject) return false;
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
  return true;
};

export const isWebPushConfigured = () => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

/**
 * @param {{
 *   subscription: { endpoint: string, keys: { p256dh: string, auth: string } },
 *   payload: object,
 *   ttlSeconds?: number
 * }} args
 */
export const sendPush = async ({ subscription, payload, ttlSeconds = 60 * 60 * 24 }) => {
  if (!ensureConfigured()) return { ok: false, reason: 'not_configured' };
  try {
    const result = await webpush.sendNotification(subscription, JSON.stringify(payload), {
      TTL: ttlSeconds
    });
    return { ok: true, statusCode: result.statusCode };
  } catch (err) {
    // 404/410 means the subscription is gone — caller should drop it.
    const expired = err?.statusCode === 404 || err?.statusCode === 410;
    return { ok: false, reason: expired ? 'expired' : 'send_failed', statusCode: err?.statusCode, error: err?.message };
  }
};
