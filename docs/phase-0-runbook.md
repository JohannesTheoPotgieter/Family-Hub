# Phase 0 runbook — taking the SaaS foundation live

Phase 0 ships the code; this doc covers the operator steps to actually run
it. Until these are done, the app continues to behave as the original
local-first prototype — Phase 0 is fail-soft on missing env vars.

## TL;DR

1. Provision Postgres (Neon), Redis (Upstash), Cloudflare R2, Resend, Clerk, Stripe.
2. Set the env vars listed in [Configuration](#configuration).
3. Run migrations against the DB.
4. Configure Clerk webhook → `/api/webhooks/clerk`.
5. Configure Stripe webhook → `/api/webhooks/stripe`.
6. Generate VAPID keypair for web push.

After step 6 the auth-gated routes (`/api/migrate/local-state`, `/api/invites`,
`/api/invites/accept`, `/api/push/subscribe`) start working.

---

## 1. Database (Neon)

Create a Neon project. Two branches by convention: `main` (prod) and `dev`.

Set:

```
DATABASE_URL=postgres://<user>:<pass>@<host>/<db>?sslmode=require
PGPOOL_MAX=10                              # optional, defaults to 10
TOKEN_ENC_KEY=<32+ char random string>     # AES-256 key for OAuth tokens
```

Generate `TOKEN_ENC_KEY`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Apply migrations

```bash
DATABASE_URL=... node server/db/migrate.mjs
```

`--status` prints applied + pending without applying:

```bash
DATABASE_URL=... node server/db/migrate.mjs --status
```

The runner uses `schema_migrations` for tracking. When the project graduates
to Drizzle Kit, the table name is preserved so the cutover is non-destructive.

### Roles

The application connects as a single `app` Postgres role that is allowed to
read/write all tenant tables. Row-level security in `0002_rls.sql` filters
every query through the `app.current_family_id` GUC, so tenants stay
isolated even though they share the role. A separate `app_admin` role
(superuser, bypasses RLS) is intended for migrations and the impact-report
job — provision it manually so its credentials never live in the repo.

---

## 2. Auth (Clerk)

Create a Clerk application. Enable email + your preferred social providers.

Set:

```
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...        # for the future client SDK
CLERK_WEBHOOK_SECRET=whsec_...
CLERK_AUTHORIZED_PARTIES=https://app.family-hub.app   # comma-separated for multi-origin
```

### Webhook

In Clerk dashboard → Webhooks, add:

- Endpoint: `https://api.family-hub.app/api/webhooks/clerk`
- Events to subscribe: `user.created`
- Copy the signing secret into `CLERK_WEBHOOK_SECRET`.

`user.created` fires a transaction that creates the `families` row, an
owner `family_member`, the family thread for connective chat, and an audit
log entry. Webhook handler is idempotent — re-deliveries no-op when the
member already exists.

---

## 3. Billing (Stripe)

Create three products in Stripe in **ZAR** (not USD-converted; see plan
§Monetization). Recommended display: R0 / R149 / R299.

For each paid product create a recurring monthly price; copy the price ids
into env:

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_FAMILY=price_...
STRIPE_PRICE_FAMILY_PRO=price_...
STRIPE_TRIAL_DAYS=14
PUBLIC_APP_URL=https://app.family-hub.app
```

### Webhook

In Stripe dashboard → Developers → Webhooks, add:

- Endpoint: `https://api.family-hub.app/api/webhooks/stripe`
- Events to send:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`

`families.plan` is the cached plan column read by `entitlementsFor`; the
webhook handler keeps it in sync. `incomplete` / `past_due` subscriptions
do **not** flip the cached plan back to free — losing access mid-cycle on
a transient card decline is bad UX. `customer.subscription.deleted`
explicitly resets the plan.

---

## 4. Email (Resend)

Create a Resend account + verify the sending domain.

```
RESEND_API_KEY=re_...
RESEND_FROM=Family-Hub <invites@family-hub.app>
```

When `RESEND_API_KEY` is unset, `createInvite` still persists the invite +
returns the raw `acceptUrl` to the inviter so they can copy/share it
manually. The route surfaces `emailSent: false` so the UI can render that
fallback explicitly.

---

## 5. Web push (VAPID)

Generate a VAPID keypair once:

```bash
npx web-push generate-vapid-keys
```

```
VAPID_PUBLIC_KEY=B...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:ops@family-hub.app
```

Ship the public key to the client via the `entitlements` payload (or a
public `/api/push/config` endpoint) so `subscribeToPush({ vapidPublicKey })`
in `src/lib/pwa/registerServiceWorker.ts` can register subscriptions.

---

## 6. CORS / origins

```
PUBLIC_APP_URL=https://app.family-hub.app
CLIENT_ORIGIN=https://app.family-hub.app   # used by server/bootstrap/http.mjs
```

The CORS allow-list now includes `Authorization`, `svix-*`, and
`stripe-signature` so the new webhooks + auth flow work end-to-end.

---

## 7. Verification checklist

- [ ] `node server/db/migrate.mjs --status` shows the three migrations
      applied (`0001_init.sql`, `0002_rls.sql`, `0003_push_subscriptions.sql`).
- [ ] Sign up via Clerk → `families` row exists with one
      `parent_admin` member and a singleton family thread.
- [ ] `POST /api/migrate/local-state` with a recorded prototype state
      JSON → counts come back, `audit_log` row written.
- [ ] `POST /api/invites` creates an invite + an email lands at the
      target address with a working `acceptUrl`.
- [ ] `POST /api/invites/accept` (with the recipient signed into Clerk)
      flips the invite to `accepted` and creates a `family_members` row.
- [ ] Stripe Checkout → completed → `subscriptions.plan` updates and
      `families.plan` mirrors it on `active`/`trialing`.
- [ ] `customer.subscription.deleted` test event flips
      `families.plan` back to `free`.
- [ ] Service worker registers in Chrome devtools → Application →
      Service Workers; PWA install prompt appears on a phone.
- [ ] Push permission grant → `push_subscriptions` row written.
- [ ] Test push send (`web-push send-notification ...`) → notification
      shows up with `[Agree]` / `[Decline]` action buttons when payload
      includes `proposalId` + `actionToken`.

---

## 8. Things deliberately not in Phase 0

These are tracked in their respective phases — the foundation does not
include them so this PR stays reviewable.

- **Drizzle ORM dep** — schema is currently hand-rolled SQL. Drizzle wiring
  lands as a 1:1 swap when DB code accumulates enough that the ergonomics
  win matters.
- **BullMQ + Upstash Redis** — needed by Phase 1.5 (calendar sync worker)
  and Phase 1.8 (reminders). No Redis env vars in this runbook yet.
- **Cloudflare R2** — needed by Phase 3.4 (photos) and 4.6 (receipts).
  Not provisioned.
- **App icons (`icon-192.png`, `icon-512.png`)** — referenced by the
  manifest, ship with the design system commit.
- **Sentry + Axiom observability** — no SDK wired yet.
- **CI preview deploys** — current CI runs typecheck + tests + build only.
  Vercel + Fly preview hooks land alongside the first real deploy.
