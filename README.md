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
