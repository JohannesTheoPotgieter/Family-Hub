# Family Hub on Replit

## Safe default for GitHub import + static publish

- The repo is still safe to import back into GitHub and open in Replit as a normal frontend project.
- The checked-in `.replit` keeps Replit publishing on a **static deployment** using `dist/`.
- For that static deployment path, keep `VITE_CALENDAR_MODE=local` so the published app does not depend on the optional Node calendar server.

## Current runtime model

- Frontend: React + Vite on port `5000`
- Optional backend: `server/index.mjs` on port `8787`
- Static Replit deployment: serves only the built frontend from `dist/`

## What works in each mode

### Static Replit publish
- Household app flows
- Tasks, Money, Places, setup, PINs, reset, export
- Internal calendar events
- Manual Google/Microsoft token entry in local mode

### Full-stack / non-static runtime
- Everything above
- Google OAuth calendar sync
- Microsoft OAuth calendar sync
- ICS subscriptions

## Commands

```bash
npm run dev        # Replit default web preview
npm run dev:all    # Frontend + optional backend together
npm run build      # Production build for static publish
```

## Notes

- `server/.family-hub-server.json` is ignored so local server credentials/subscriptions are not committed back to GitHub.
- If you want Google/Microsoft/ICS on a published Replit app, use a deployment type that can run a backend server instead of the static deployment flow.
