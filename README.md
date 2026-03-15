# Family Hub

## Calendar modes

### Mode A: Local-only (`VITE_CALENDAR_MODE=local`)
- No backend required for Google or Microsoft reads.
- Tokens are held in browser memory/session storage only.
- Google + Microsoft are read-only.
- ICS may fail due to CORS; switch to server mode if blocked.
- Apple/CalDAV is intentionally blocked in local mode for security and CORS reasons.

### Mode B: Secure backend (`VITE_CALENDAR_MODE=server`)
- Run Express server for OAuth callback handling and API proxying.
- Refresh tokens are encrypted at rest with AES-GCM (`TOKEN_ENC_KEY`).
- Supports server routes for CalDAV and ICS subscriptions.

## Scripts
- `npm run dev:client` – Vite client.
- `npm run dev:server` – Express API server.
- `npm run dev:all` – Run both together.
- `npm run test` – unit tests.

## Provider setup notes
- Google: fill client id/secret and redirect URI.
- Microsoft: fill app registration values.
- Apple CalDAV: server mode required, use app-specific password for iCloud.

## Money Manager data model update
- `state.money` now uses `{ bills, transactions, budgets, settings }`.
- Money amounts are stored as integer cents (`amountCents`, `limitCents`) for safer calculations.
- Existing saved data is migrated automatically from legacy `payments` + `actualTransactions` and float `amount` fields.

## Avatar Companion + Family Challenge system
- Avatar progression now lives in `state.avatarGame` with versioned migration from legacy avatar points.
- Companion growth is tied to real household actions (tasks, calendar, bills, setup, check-ins) through pure reward functions in `src/domain/avatarRewards.ts`.
- Family challenges auto-seed and track per-user contributions with shared unlock rewards.
- Companion UX lives in More → Avatar Home and includes 3D-style full-body interactions with a safe 2D fallback path for reduced motion / unsupported devices.
