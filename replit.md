# Family Hub

A phone-first React web app for Johannes and Nicole's shared household.

## Architecture

- **Framework**: React 18 + Vite 7 (TypeScript)
- **Styling**: Vanilla CSS with glassmorphic premium design system (`src/styles.css`, `src/theme.css`)
- **State**: localStorage persistence via `loadState`/`saveState` in `src/lib/family-hub/storage.ts`
- **No backend**: Fully frontend-only, all data in localStorage
- **Port**: Dev server runs on port 5000

## Project Structure

```
src/
  main.tsx                          — App entry point
  FamilyHubApp.tsx                  — Root component + state management
  styles.css                        — Component styles
  theme.css                         — Design tokens + glassmorphic base
  lib/family-hub/
    storage.ts                      — All TypeScript types + localStorage
    constants.ts                    — USERS array, TABS, UserId type
    date.ts                         — Date helpers (getTodayIso, isSameDay)
    format.ts                       — formatCurrency (ZAR), formatPoints
    pin.ts                          — PIN encoding (btoa) + verification
  components/family-hub/
    LoginScreen.tsx                 — Profile picker + PIN entry
    SetupWizard.tsx                 — First-time setup flow
    HomeScreen.tsx                  — Dashboard with metrics + avatar strip
    CalendarScreen.tsx              — Calendar with events/payments/tasks
    TasksScreen.tsx                 — Task list with filters and groups
    MoneyScreen.tsx                 — Transactions, payments, budget, cashflow
    MoreScreen.tsx                  — Avatars, places, users, settings
    AvatarsSection.tsx              — Avatar customization component
    BaselineScaffold.tsx            — Shared ScreenIntro + FoundationBlock components
```

## Users

- **Johannes** (active) — ID: `johannes`
- **Nicole** (active) — ID: `nicole`
- **Ella** (inactive/future) — ID: `ella`
- **Oliver** (inactive/future) — ID: `oliver`

## Key Details

- Currency: ZAR (R)
- Week starts Monday
- PIN encoding: `btoa('family-hub-local-v1:userId:pin')`
- User IDs are string literals: `'johannes' | 'nicole' | 'ella' | 'oliver'`
- No path aliases — use relative imports only

## Development

```bash
npm run dev      # Start dev server on port 5000
npm run build    # TypeScript check + Vite build to dist/
npm run preview  # Preview production build
```

## Deployment

Static site deployment. Build outputs to `dist/`. Configure in `.replit`:
```toml
[deployment]
build = ["sh", "-c", "npm run build"]
deploymentTarget = "static"
publicDir = "dist/"
```
