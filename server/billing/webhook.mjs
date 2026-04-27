// Stripe webhook handler (Phase 0.6).
//
// Validates signatures via Stripe.webhooks.constructEvent (raw body required)
// and updates the `subscriptions` row + cached `families.plan` in one
// transaction. The cached plan is what the rest of the server reads via
// entitlementsFor; that means a plan change is one UPDATE away from
// affecting permission checks — no cache invalidation dance.
//
// Events handled:
//   checkout.session.completed       — link customer to family
//   customer.subscription.created    — write subscription row
//   customer.subscription.updated    — update plan/status/period_end
//   customer.subscription.deleted    — mark canceled
//   invoice.payment_failed           — flip status to past_due
//
// Anything else is acknowledged (200) but ignored — Stripe redelivers on
// non-200, and we don't want noisy retries for events we don't care about.

import { readRawBody } from '../http.mjs';
import { getStripe, isStripeConfigured } from './stripe.mjs';
import { getPool } from '../db/pool.mjs';
import { isPlan } from './entitlements.mjs';

const planFromPriceId = (priceId) => {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_FAMILY) return 'family';
  if (priceId === process.env.STRIPE_PRICE_FAMILY_PRO) return 'family_pro';
  return null;
};

const planFromSubscription = (subscription) => {
  const item = subscription?.items?.data?.[0];
  return planFromPriceId(item?.price?.id);
};

export const handleStripeWebhook = async (req) => {
  if (!isStripeConfigured()) {
    const err = new Error('Stripe is not configured.');
    err.status = 503;
    throw err;
  }
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    const err = new Error('STRIPE_WEBHOOK_SECRET is not set.');
    err.status = 500;
    throw err;
  }
  const sig = req.headers['stripe-signature'];
  const raw = await readRawBody(req);
  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    const wrapped = new Error(`stripe webhook signature verification failed: ${err.message}`);
    wrapped.status = 400;
    throw wrapped;
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await processEvent(client, event);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

const processEvent = async (client, event) => {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const familyId = session.client_reference_id ?? session.metadata?.familyId;
      const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
      if (!familyId || !customerId) return;
      await client.query(
        `INSERT INTO subscriptions (family_id, stripe_customer_id, plan, status, updated_at)
         VALUES ($1, $2, 'free', 'incomplete', now())
         ON CONFLICT (family_id) DO UPDATE SET stripe_customer_id = EXCLUDED.stripe_customer_id, updated_at = now()`,
        [familyId, customerId]
      );
      return;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object;
      const familyId = sub.metadata?.familyId;
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
      const plan = planFromSubscription(sub) ?? 'free';
      if (!isPlan(plan)) return;
      const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;

      // Find the row by family id (preferred) or customer id (fallback for
      // checkout flows that didn't carry metadata).
      const familyByCustomer = await client.query(
        `SELECT family_id FROM subscriptions WHERE stripe_customer_id = $1 LIMIT 1`,
        [customerId]
      );
      const targetFamily = familyId ?? familyByCustomer.rows[0]?.family_id ?? null;
      if (!targetFamily) return;

      await client.query(
        `UPDATE subscriptions
            SET stripe_subscription_id = $2,
                plan = $3,
                status = $4,
                current_period_end = $5,
                cancel_at_period_end = $6,
                updated_at = now()
          WHERE family_id = $1`,
        [
          targetFamily,
          sub.id,
          plan,
          sub.status, // trialing | active | past_due | canceled | incomplete | incomplete_expired | unpaid
          periodEnd,
          Boolean(sub.cancel_at_period_end)
        ]
      );

      // Mirror the active plan onto families.plan so route-level entitlement
      // checks don't need a join. 'incomplete' / 'past_due' subscriptions
      // keep whatever plan was previously cached — losing access mid-cycle
      // because of a transient card decline is bad UX.
      if (sub.status === 'active' || sub.status === 'trialing') {
        await client.query(`UPDATE families SET plan = $2 WHERE id = $1`, [targetFamily, plan]);
      }

      await client.query(
        `INSERT INTO audit_log (family_id, action, entity_kind, diff)
         VALUES ($1, 'subscription.updated', 'subscription', $2::jsonb)`,
        [targetFamily, JSON.stringify({ plan, status: sub.status, eventId: event.id })]
      );
      return;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
      const found = await client.query(
        `UPDATE subscriptions
            SET status = 'canceled', plan = 'free', updated_at = now()
          WHERE stripe_customer_id = $1
          RETURNING family_id`,
        [customerId]
      );
      const familyId = found.rows[0]?.family_id;
      if (familyId) {
        await client.query(`UPDATE families SET plan = 'free' WHERE id = $1`, [familyId]);
        await client.query(
          `INSERT INTO audit_log (family_id, action, entity_kind, diff)
           VALUES ($1, 'subscription.canceled', 'subscription', $2::jsonb)`,
          [familyId, JSON.stringify({ eventId: event.id })]
        );
      }
      return;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
      await client.query(
        `UPDATE subscriptions SET status = 'past_due', updated_at = now()
          WHERE stripe_customer_id = $1`,
        [customerId]
      );
      return;
    }

    default:
      // No-op; ack and move on.
      return;
  }
};
