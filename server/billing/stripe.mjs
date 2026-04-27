// Stripe client + checkout/portal helpers (Phase 0.6).
//
// Wraps the Stripe SDK so route handlers don't import it directly. Fail-soft
// when STRIPE_SECRET_KEY is unset: `isStripeConfigured()` returns false and
// callers can render the prototype "billing is offline" state.

import Stripe from 'stripe';

let cached = null;

export const isStripeConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY);

export const getStripe = () => {
  if (cached) return cached;
  if (!isStripeConfigured()) return null;
  cached = new Stripe(process.env.STRIPE_SECRET_KEY, {
    // Pin a known-good API version so SDK upgrades don't silently change
    // webhook payload shape under us.
    apiVersion: '2024-11-20.acacia'
  });
  return cached;
};

const PRICE_IDS = () => ({
  family: process.env.STRIPE_PRICE_FAMILY ?? '',
  family_pro: process.env.STRIPE_PRICE_FAMILY_PRO ?? ''
});

const successUrl = () =>
  `${(process.env.PUBLIC_APP_URL ?? 'http://localhost:5173').replace(/\/$/, '')}/billing/success?session_id={CHECKOUT_SESSION_ID}`;
const cancelUrl = () =>
  `${(process.env.PUBLIC_APP_URL ?? 'http://localhost:5173').replace(/\/$/, '')}/billing/cancel`;

/**
 * Mint a Checkout Session for upgrading to `plan`. Pass an existing Stripe
 * customer id when the family already has one; otherwise Stripe creates one.
 *
 * @param {{ plan: 'family' | 'family_pro', customerId?: string | null, familyId: string, customerEmail?: string }} args
 */
export const createCheckoutSession = async ({ plan, customerId, familyId, customerEmail }) => {
  const stripe = getStripe();
  if (!stripe) {
    const err = new Error('Stripe is not configured.');
    err.status = 503;
    throw err;
  }
  const priceId = PRICE_IDS()[plan];
  if (!priceId) {
    const err = new Error(`Stripe price id missing for plan ${plan}`);
    err.status = 500;
    throw err;
  }
  return stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl(),
    cancel_url: cancelUrl(),
    customer: customerId ?? undefined,
    customer_email: customerId ? undefined : customerEmail,
    client_reference_id: familyId,
    // Cancellation is one-click in-app (Mission M6) — the portal is offered
    // separately via createPortalSession, not from the checkout success page.
    allow_promotion_codes: true,
    subscription_data: {
      metadata: { familyId },
      trial_period_days: Number(process.env.STRIPE_TRIAL_DAYS ?? 14)
    }
  });
};

/**
 * Mint a Billing Portal session so a customer can manage their subscription
 * (cancel, update card, view invoices) — one click, no phone calls.
 */
export const createPortalSession = async ({ customerId }) => {
  const stripe = getStripe();
  if (!stripe) {
    const err = new Error('Stripe is not configured.');
    err.status = 503;
    throw err;
  }
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${(process.env.PUBLIC_APP_URL ?? 'http://localhost:5173').replace(/\/$/, '')}/settings/billing`
  });
};
