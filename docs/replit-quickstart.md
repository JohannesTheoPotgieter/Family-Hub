# Replit quickstart — running the latest design

Family-Hub runs end-to-end on Replit. Two modes:

1. **Prototype mode** (zero setup, default) — runs the localStorage-backed
   prototype just like before the SaaS work. Click Run, the existing app
   loads in the iframe preview, no auth needed.
2. **Server-backed mode** (~10 minutes setup) — provision Postgres + Clerk
   dev keys, the new Decision Inbox / Server Calendar / Chore Mode /
   Money Insights / Family Chat panels light up.

This doc walks the second path.

---

## What you need

- A Replit account (free tier is fine for soft launch scale)
- 10 minutes
- A Clerk dev account (free tier — 10K MAU)
- A Postgres database — Replit's built-in or an external Neon project

## 1. Provision the database

**Option A — Replit's built-in Postgres:**
- Click **Database** in the left sidebar → **Create Database** → **PostgreSQL**
- Replit auto-injects `DATABASE_URL` into your env. Done.

**Option B — Neon (recommended for ZA data residency):**
- Sign up at [neon.tech](https://neon.tech), pick the `af-south-1` region
- Copy the connection string → add as a Secret named `DATABASE_URL`

## 2. Set Replit Secrets

Open the **Secrets** panel (lock icon in the sidebar) and add:

| Key | Value |
|-----|-------|
| `DATABASE_URL` | from step 1 |
| `TOKEN_ENC_KEY` | run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and paste |
| `PUSH_ACTION_TOKEN_SECRET` | another random 32+ char string |
| `REALTIME_TICKET_SECRET` | another random 32+ char string |
| `CLERK_PUBLISHABLE_KEY` | `pk_test_…` from Clerk Dashboard → API Keys |
| `CLERK_SECRET_KEY` | `sk_test_…` from same panel |
| `CLERK_WEBHOOK_SECRET` | `whsec_…` (set after step 4) |
| `PUBLIC_APP_URL` | your Repl's public URL, e.g. `https://family-hub.your-name.repl.co` |
| `CLIENT_ORIGIN` | same value as `PUBLIC_APP_URL` |

Optional but useful:

| Key | What it enables |
|-----|-----------------|
| `ANTHROPIC_API_KEY` | AI parse for proposals (`/api/chat/parse`) |
| `RESEND_API_KEY` + `RESEND_FROM` | invite emails actually send |
| `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT` | web push notifications |
| `REDIS_URL` | BullMQ workers + cross-process realtime fan-out |
| `STRIPE_*` | subscriptions / Paywall checkout |
| `OPENAI_API_KEY` | profanity moderation pass on chat messages |
| `R2_*` | photo / receipt uploads |

Each integration is **fail-soft** — the app still runs without these, those
features just degrade gracefully.

## 3. Apply database migrations

Open the Replit shell and run:

```bash
node server/db/migrate.mjs
```

You should see all seven migrations apply (`0001_init` → `0007_money_currency_rates`).

Confirm with:

```bash
node server/db/migrate.mjs --status
# expects: { "applied": [...], "pending": [] }
```

## 4. Configure the Clerk webhook

The `user.created` webhook seeds the family + parent_admin member + family
thread + default task lists when someone signs up.

1. In Clerk Dashboard → **Webhooks** → **Add Endpoint**
2. URL: `<your-public-app-url>/api/webhooks/clerk`
3. Events: tick `user.created`
4. Copy the **Signing Secret** (`whsec_…`) and paste into Replit Secrets as
   `CLERK_WEBHOOK_SECRET`

## 5. Click Run

The `.replit` workflow is configured to start both the API server (port
8787) and the Vite dev server (port 5000) in parallel. Vite proxies
`/api/*` to the API server, so the public Replit URL serves both the SPA
and the API endpoints from one origin.

When the iframe preview loads:

- If Clerk is **not** configured → the prototype renders (existing
  PIN-based login + localStorage state). This is the dev-default behavior.
- If Clerk **is** configured → you'll see the Clerk sign-in page.

## 6. Sign up + smoke test

- Click **Create a family** on the sign-in page
- Complete Clerk's email-and-password (or social) sign-up
- Webhook fires server-side → creates a `families` row, your
  `family_member` (role: `parent_admin`), the singleton family thread,
  and the three default task lists (Household / Errands / Kids)
- You land on Home — the Decision Inbox renders ("You're all clear")
- Visit `/calendar` (the Calendar tab) → ServerCalendarPanel renders empty
- Visit `/tasks` → MyChoresPanel
- Visit `/money` → MoneyServerPanel (R0 spare, R0 net worth)
- Visit `/more` → FamilyChatPanel embeds the family thread

If you don't see the new panels, check:
- Browser console for fetch errors against `/api/me`
- Replit shell for "[migrate]" output and any Postgres connection errors
- Clerk Dashboard → Webhooks → check the most recent delivery's response

## 7. Trigger a real proposal flow

To validate the propose → push → approve loop without setting up VAPID:

1. Sign up a second account in an incognito window
2. From your first account, send an invite via Settings (once that UI lands
   — for now you can `INSERT` a second `family_member` row directly via
   the Replit Postgres console)
3. Mom proposes a calendar event move via the Calendar tab
4. Dad refreshes Home → sees the proposal in the Decision Inbox
5. Dad taps **Agree** → the event moves
6. Mom's screen flips automatically via SSE realtime

## Common Replit gotchas

- **Port forwarding**: only port 5000 is exposed externally. The API runs
  on 8787, accessible only via the vite proxy. Don't try to set
  `PUBLIC_APP_URL` to the API's port.
- **Always-on**: free Repls go to sleep. The dev URL stays the same when
  it wakes, but the BullMQ workers (when Redis is configured) need a
  Reserved VM / Always-On plan to run continuously. For Tier 1 beta
  testing, the dev URL is fine — workers can run via cron triggers.
- **Webhook reachability**: Clerk needs to reach your Repl URL. Free
  Repls work for this *while running*; wake the Repl before testing
  signup if it's been asleep.
- **DNS for production**: when you're ready for a real domain, use Replit
  **Deployments** which gives a stable `<name>.replit.app` URL or accepts
  custom domain CNAMEs.

## Going from Replit dev to production

Two paths:

1. **Stay on Replit** — promote the Repl to a Replit Deployment for a
   stable URL + always-on. Per-deployment cost ~$7/mo.
2. **Move to Vercel + Fly.io** — see `docs/phase-0-runbook.md` for the
   operator-grade setup.

Either way the Postgres + Clerk + Stripe configuration is identical.

---

## Bank linking — what's free, what isn't

A common question: how do families pull bank transactions in for free?

**Free path that works today:**

- **Statement import** — the prototype has `src/lib/family-hub/statementImport.ts`
  which parses CSV / TSV / OFX statements and dedupes against existing
  transactions. Every SA bank lets you download monthly statements in one
  of these formats from their app or web banking.
- The user uploads the statement → categories auto-fill → done.
- Free forever. Works for every bank. No API account required. No
  per-customer fees.

**Stitch (the real ZA bank-linking API) — sandbox is free:**

- [stitch.money](https://stitch.money) has a free sandbox with sample
  customer data — perfect for development + screenshots.
- Production access requires a commercial agreement; pricing is per
  active connected account per month.
- Worth the cost when you have paying users; not worth it for a soft
  launch beta.

**Plaid / TrueLayer:**

- Plaid: US/CA primarily; SA support is patchy and expensive.
- TrueLayer: UK/EU primarily; same.

**Recommendation for Tier 1:**

1. Ship statement import as the primary flow. Add a one-tap "Upload
   statement" action on the Money screen. Frequency: monthly.
2. Keep the Stitch adapter wired (already done in
   `server/banking/stitch.mjs`) but disabled until you have ~50 paying
   families and the per-account fee makes economic sense.
3. When you upgrade to Stitch live, the BankProvider interface lets
   families opt in per-account — they keep statement import for old
   accounts, link new ones via Stitch.

This lets you launch with zero per-user banking cost, and graduate
gracefully when revenue justifies it.
