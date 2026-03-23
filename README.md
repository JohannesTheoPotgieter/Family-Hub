# Family Hub

## Calendar modes

### Mode A: Local-only (`VITE_CALENDAR_MODE=local`)
- No backend required for Google or Microsoft reads.
- Tokens are held in browser memory/session storage only.
- Google and Microsoft are read-only in this mode.
- ICS subscriptions are intentionally handled in server mode so they stay reliable.

### Mode B: Secure backend (`VITE_CALENDAR_MODE=server`)
- Run the Node API server for OAuth callback handling, provider sync, and ICS subscriptions.
- Refresh tokens are encrypted at rest with AES-GCM (`TOKEN_ENC_KEY`) and the server now requires that key to be explicitly set.
- Supports Google, Microsoft, and ICS subscriptions.
- ICS subscriptions are limited to verified public `http(s)` URLs and OAuth callbacks only redirect back to `CLIENT_ORIGIN`.
- Normal boot is read-only with respect to the persistence file; reset behavior is blocked unless `FAMILY_HUB_MAINTENANCE_MODE=1` or the explicit maintenance script is used.

## Scripts
- `npm run dev:client` - Vite client on port `5000`.
- `npm run dev:server` - Node API server on port `8787`.
- `npm run dev:all` - Run both together on Windows, macOS, or Linux.
- `npm run test` - unit tests.
- `npm run maintenance:reset-server-state -- --force` - explicit maintenance-only reset of encrypted provider tokens and ICS subscriptions.

## Provider setup notes
- Set `VITE_API_BASE_URL=http://localhost:8787` in the client env when using server mode locally.
- Google: fill client id, secret, and redirect URI.
- Microsoft: fill the app registration values.
- ICS: paste a subscription URL in Calendar after the server is running.
- Synced external calendars are persisted into Family Hub state so they appear on Home, Calendar, and alerts after refresh.

## Money Manager data model update
- `state.money` uses `{ bills, transactions, budgets, settings }`.
- Money amounts are stored as integer cents (`amountCents`, `limitCents`) for safer calculations.
- Existing saved data is migrated automatically from legacy `payments` + `actualTransactions` and float `amount` fields.
- The Money overview now includes a cashflow planner with opening balance, bills still due, projected closing balance, and starter budget suggestions.

## Avatar Companion + Family Challenge system
- Avatar progression lives in `state.avatarGame` with versioned migration from legacy avatar points.
- Companion growth is tied to real household actions through pure reward functions in `src/domain/avatarRewards.ts`.
- Family challenges auto-seed and track per-user contributions with shared unlock rewards.
- Companion UX lives in More -> Companion home and includes a safe 2D fallback path for reduced motion or unsupported devices.
