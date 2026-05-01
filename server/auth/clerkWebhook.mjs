// Clerk webhook handler — `user.created` seeds a family + owner member.
// Signature is verified via svix using CLERK_WEBHOOK_SECRET.

import { getPool } from '../db/pool.mjs';
import { verifyClerkWebhook } from './clerk.mjs';
import { readRawBody } from '../http.mjs';
import { seedDefaultTaskLists } from '../tasks/taskStore.mjs';

export const verifyClerkWebhookRequest = async (req) => {
  // svix needs the raw body (not the parsed JSON) to validate the signature.
  const raw = await readRawBody(req);
  const headers = {
    'svix-id': req.headers['svix-id'],
    'svix-timestamp': req.headers['svix-timestamp'],
    'svix-signature': req.headers['svix-signature']
  };
  return verifyClerkWebhook(raw, headers);
};

const pickDisplayName = (clerkUser) => {
  const first = clerkUser.first_name ?? clerkUser.firstName ?? '';
  const last = clerkUser.last_name ?? clerkUser.lastName ?? '';
  const joined = `${first} ${last}`.trim();
  if (joined) return joined;
  const emails = clerkUser.email_addresses ?? clerkUser.emailAddresses ?? [];
  const primary = emails.find?.((e) => e.id === clerkUser.primary_email_address_id) ?? emails[0];
  return primary?.email_address ?? primary?.emailAddress ?? 'New member';
};

/**
 * Idempotently provision a family + parent_admin member + family thread +
 * default task lists for a Clerk user. Called from two places:
 *
 *   1. The user.created webhook (the production / "right" path).
 *   2. The /api/me request flow (the fallback path that handles
 *      webhook-not-configured-yet, webhook-races-the-first-request, and
 *      Replit-dev where Clerk can't reach the dev URL).
 *
 * No-op if a `family_members` row already exists for `userId`.
 *
 * @param {{ userId: string, displayName: string, source: string }} args
 */
export const provisionFamily = async ({ userId, displayName, source }) => {
  if (!userId) throw new Error('userId required');
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: existing } = await client.query(
      'SELECT family_id FROM family_members WHERE user_id = $1 LIMIT 1',
      [userId]
    );
    if (existing.length) {
      await client.query('COMMIT');
      return { familyId: existing[0].family_id, created: false };
    }

    const name = displayName?.trim() || 'New member';

    const { rows: families } = await client.query(
      `INSERT INTO families (name, owner_user_id, locale, tax_year_start_month, plan, trial_ends_at)
       VALUES ($1, $2, 'GLOBAL', 1, 'free', now() + interval '14 days')
       RETURNING id`,
      [`${name}'s family`, userId]
    );
    const familyId = families[0].id;

    await client.query(
      `INSERT INTO family_members (family_id, user_id, display_name, role_key, status)
       VALUES ($1, $2, $3, 'parent_admin', 'active')`,
      [familyId, userId, name]
    );

    await client.query(
      `INSERT INTO threads (family_id, kind, e2e_encrypted)
       VALUES ($1, 'family', true)`,
      [familyId]
    );

    await client.query(
      `INSERT INTO audit_log (family_id, action, entity_kind, diff)
       VALUES ($1, 'family.created', 'family', $2::jsonb)`,
      [familyId, JSON.stringify({ source, userId })]
    );

    await client.query('COMMIT');

    // Seed default task lists in a separate transaction. Non-fatal.
    await seedDefaultTaskLists(familyId).catch(() => {});

    return { familyId, created: true };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

/**
 * @param {object} clerkUser - the `data` field from a Clerk webhook event.
 */
export const handleClerkUserCreated = async (clerkUser) => {
  if (!clerkUser?.id) throw new Error('clerk webhook missing user id');
  return provisionFamily({
    userId: clerkUser.id,
    displayName: pickDisplayName(clerkUser),
    source: 'clerk_webhook'
  });
};
