# Family Hub architecture audit — 2026-03-22

## Executive summary

Family Hub is currently a **local-first single-page React app with one large controller hook and one large persisted state object**. Almost all product behavior flows through `useFamilyHubController`, `appState`, and `storage`, while the UI is organized into a handful of large screen components rather than bounded feature modules. The backend exists, but only for calendar/provider integration; it is not the system of record for application data.

That split creates the repo's main architectural tension: the **frontend behaves like a complete app platform**, while the **backend behaves like a narrow integration sidecar**. This keeps development simple, but it also causes permission checks, routing, persistence, reset behavior, seed/setup data, and UX consistency to be enforced in scattered client code instead of in stable domain or server boundaries.

The codebase is still small enough to refactor safely, but several files are already overloaded:

- `src/lib/family-hub/storage.ts` mixes schema, defaults, migrations, sanitization, persistence, and setup seeding.
- `src/lib/family-hub/appState.ts` mixes reducers, side-effect-sensitive initialization, reward logic triggers, URL-driven routing state, and entity creation.
- `src/lib/family-hub/useFamilyHubController.tsx` is a god-hook that owns orchestration for nearly every screen.
- `src/components/family-hub/MoneyScreen.tsx`, `MoreScreen.tsx`, `CalendarScreen.tsx`, and `HomeScreen.tsx` are feature containers with substantial domain logic embedded in view code.
- `src/styles.css` is a monolithic styling surface with duplicate breakpoint logic and component-level concerns mixed together.

The highest-risk theme is **production runtime behavior being coupled to local demo/setup/runtime conveniences**: setup seeding writes real bills/transactions/budgets into the same `money` store as ongoing production data, reset flows can clear both client and provider state from the UI, and import/export directly round-trip the full app object graph.

## System shape by area

### 1. Frontend structure

- Entrypoint is minimal: `src/main.tsx` mounts `FamilyHubApp` and loads three global CSS files.
- `src/FamilyHubApp.tsx` is the effective shell, choosing between setup, login, and five tab screens using conditional rendering rather than route objects.
- Frontend code is partitioned by **screen** (`src/components/family-hub/*`) and by **shared logic** (`src/lib/family-hub/*`), but the boundaries are shallow.
- The UI layer is only partially componentized. There is a small primitive set in `src/ui/*`, but many screens still render repeated structures directly with global class names.
- There is no state library, router, query layer, form framework, or design-system package; all of those concerns are hand-rolled.

### 2. Backend structure

- `server/index.mjs` is the real runtime entrypoint and exposes a thin HTTP API for health, provider status, OAuth, calendar/event fetches, ICS subscriptions, and reset.
- `server/providers.mjs`, `server/oauth.mjs`, `server/ics.mjs`, `server/security.mjs`, `server/http.mjs`, and `server/storage.mjs` are reasonably separated for a small service.
- The backend stores **provider tokens and ICS subscriptions only** in `.family-hub-server.json`; it is not used for household users, tasks, money, reminders, or settings.
- `server/index.ts` is an obsolete second server implementation with different dependencies and mock behaviors, which makes the backend structure ambiguous.

### 3. Routing and permissions

- Navigation is tab state, not URL routing. The active tab is initialized from `?tab=` once and then maintained in React state.
- Screen selection happens in `src/FamilyHubApp.tsx`; there is no route-level code splitting or route-guard abstraction.
- Permissions are centralized only partially in `src/lib/family-hub/permissions.ts`.
- Actual enforcement is mostly screen/controller prop gating (`canEditMoney`, `canAssignTasks`, `canResetApp`, etc.), which is easy to drift because mutation functions remain broadly reachable from the controller.
- Server APIs are not permission-aware with respect to household roles; they trust the browser app origin rather than authenticated users.

### 4. Startup/runtime behavior

- Client startup loads `localStorage`, sanitizes/migrates it, nulls active session fields, ensures avatar challenges, and persists on every state change.
- Runtime is highly browser-dependent (`window`, `localStorage`, `sessionStorage`, `history`, `matchMedia`) and not abstraction-friendly.
- Calendar integration has two modes (`local` and `server`) selected by build-time env vars, which changes runtime behavior significantly.
- The server starts only when `server/index.mjs` is executed directly, which is good for tests, but the client/server contract remains mostly convention-based.

### 5. Data model and migrations

- The data model is a single coarse `FamilyHubState` object containing users, setup, avatars, tasks, money, places, reminders, settings, audit log, and calendar state.
- Persistence migrations live inside `loadState()` in `storage.ts`; there is no versioned migration registry.
- Money migration, avatar migration, sanitization, seed-from-setup logic, and default-state construction are all interleaved in one file.
- There are no database migrations because there is no production database; the data model is effectively a browser-storage schema.

### 6. Seed/demo/test data contamination risk

- Setup wizard completion writes seeded opening balances, income, recurring bills, and budgets directly into the live `money` store via `seedMoneyFromSetupProfiles`.
- Seed artifacts are distinguished only by generated IDs and notes, not by a separate source-of-truth layer or explicit onboarding namespace.
- `createInitialState()` ships with fixed household members, avatar defaults, default savings goals, and generated avatar companion metadata, so demo defaults are inseparable from production defaults.
- Backup import/export round-trips the full household state object, so imported seed/demo artifacts become first-class production data immediately.

### 7. Dependency sprawl

- Declared dependencies are currently light: React plus Vite/TypeScript tooling and `concurrently`.
- The bigger risk is **codepath sprawl without package sprawl**: handwritten routing, persistence, modal state, toasts, forms, calendar providers, ICS parsing, money logic, statement import parsing, and permissions all live in local code.
- `server/index.ts` references packages (`express`, `cors`, `node-ical`) that are not declared in the current root manifest, which indicates repo drift and dead-code dependency confusion.

### 8. Mobile responsiveness foundations

- The app is styled around an `app-phone-frame` shell and global responsive CSS, so there is a clear mobile-first intention.
- However, responsiveness is managed in one large stylesheet with repeated breakpoint sections and screen-specific grid rules.
- Because layout rules are global and screens compose ad hoc card structures, consistency depends on discipline rather than enforced component patterns.

### 9. State management and API data flow

- State lives in one top-level React `useState` inside `useFamilyHubController`.
- Domain mutations are plain functions in `appState.ts` and `money.ts`, but orchestration and persistence side effects stay in the controller.
- API data flow for calendars is imperative: screen -> integration client -> fetch -> screen callback -> controller -> state patch.
- There is no cache boundary between server data and local state, no optimistic update discipline, and no query invalidation model.

### 10. Reusability of UI components

- There is an initial reusable UI layer (`Button`, `Card`, `Chip`, `Modal`, `Progress`, `Toast`), plus small scaffolding helpers.
- Reuse drops off quickly inside feature screens. The largest screens still render custom cards, list rows, forms, and summary blocks directly instead of composing from stable feature subcomponents.
- `MoneyScreen.tsx` and `MoreScreen.tsx` especially contain many view variants that would be expensive to keep visually consistent over time.

## Top 10 risks ranked by severity

1. **Single-file state/schema/migration overload in `storage.ts` can corrupt persisted user data during future changes.** Schema defaults, migrations, sanitization, setup seeding, and persistence are all coupled in one 675-line file.
2. **Permission enforcement is mostly a UI concern, not a domain/server guarantee.** Mutation capability is broadly exposed from the controller, while screens selectively hide or disable actions.
3. **Setup seed logic contaminates production money data.** Opening balances, recurring bills, and starter budgets are inserted into live money collections instead of being tracked as onboarding-only projections.
4. **Two backend implementations exist (`server/index.mjs` and `server/index.ts`).** One is real, one is mock/obsolete, and they imply different dependencies and security postures.
5. **The god-hook/controller pattern creates wide blast radius for changes.** `useFamilyHubController` couples login, setup, import/export, reset, calendar sync, and all feature mutations.
6. **Client runtime mode switching (`local` vs `server`) changes security and data flow semantics.** Token handling moves between `sessionStorage` and server storage depending on env, which is fragile and hard to test comprehensively.
7. **Reset behavior is too powerful in runtime UI.** UI-driven reset can wipe local app state and provider connections with minimal architectural separation between user intent, authorization, and destructive execution.
8. **Large screen components mix domain logic with presentation.** This raises regression risk and encourages inconsistent UX rules between tabs.
9. **Monolithic global CSS increases accidental coupling and responsiveness regressions.** The same stylesheet owns shell, feature, utility, and breakpoint rules.
10. **There is no authoritative backend data model.** If the app later needs multi-device sync or real permissions, nearly every feature path will need rework.

## Top 10 improvement opportunities ranked by impact

1. **Split `storage.ts` into `schema`, `defaults`, `migrations`, `sanitizers`, and `persistence`.** This gives the repo a safer evolution path immediately.
2. **Replace the god-hook with feature controllers or reducer slices** for auth/setup, tasks, money, calendar, and settings.
3. **Create a real route model** for login, setup, and app tabs, even if it remains lightweight.
4. **Move permission checks into domain action functions** so illegal state changes cannot occur merely because a button was wired incorrectly.
5. **Separate onboarding/setup artifacts from live money entities.** Keep setup inputs in a profile/onboarding domain and derive starter suggestions instead of inserting live transactions/bills automatically.
6. **Delete or quarantine `server/index.ts` and document `server/index.mjs` as the only runtime.** This removes backend ambiguity and dead dependency expectations.
7. **Introduce a versioned client-state migration registry.** Each persisted schema change should be incremental and testable.
8. **Break the largest screens into feature submodules** (`money/overview`, `money/bills`, `money/budgets`, `money/import`, etc.).
9. **Create a stronger UI composition layer** for section headers, empty states, stat cards, form rows, filter bars, and list rows.
10. **Establish an API boundary for server-backed data.** Even before full sync, calendar/provider state should be handled through dedicated service/query modules rather than directly patched into the global app state.

## Overloaded files/modules

- `src/lib/family-hub/storage.ts`
  - Responsibilities: types, defaults, migrations, sanitization, onboarding seeding, avatar defaults, localStorage I/O.
- `src/lib/family-hub/appState.ts`
  - Responsibilities: domain mutation helpers, reward side effects, URL-derived tab initialization, reset-state creation, entity ID creation.
- `src/lib/family-hub/useFamilyHubController.tsx`
  - Responsibilities: state ownership, persistence wiring, permissions wiring, orchestration for every feature, async auth/setup/reset flows.
- `src/components/family-hub/MoneyScreen.tsx`
  - Responsibilities: dashboards, filters, CRUD forms, statement import workflow, budget editing, bills, transactions, savings UI.
- `src/components/family-hub/MoreScreen.tsx`
  - Responsibilities: settings, places, users, exports/imports, resets, avatar summary, audit log, setup restart.
- `src/components/family-hub/CalendarScreen.tsx`
  - Responsibilities: provider connection UX, sync orchestration, local/manual token fallback, filter state, modal state, calendar/agenda presentation.
- `src/styles.css`
  - Responsibilities: global shell, feature styles, utility patterns, responsive rules, and repeated overrides.

## Fragile files/modules

- `src/lib/family-hub/storage.ts`
  - Fragile because any persistence/schema change can affect all users at load time.
- `src/integrations/calendar/index.ts`
  - Fragile because runtime mode, token storage, redirects, OAuth bootstrapping, and fetch helpers are tightly coupled.
- `server/index.mjs`
  - Fragile because the HTTP surface is hand-routed in a single file and depends on many convention-based query/path checks.
- `src/FamilyHubApp.tsx`
  - Fragile because screen composition, navigation visibility, and auth/setup branching all live together.
- `src/components/family-hub/CalendarScreen.tsx`
  - Fragile because provider UX branches on both permissions and runtime mode, and it mutates URL state directly.
- `src/styles.css`
  - Fragile because broad selectors and repeated media-query sections make unintended style regressions likely.

## Places where demo/seed logic is too close to production runtime

- `src/lib/family-hub/storage.ts`:
  - `createInitialState()` bakes in a specific family roster, avatar defaults, savings goals, and companion defaults.
  - `seedMoneyFromSetupProfiles()` inserts starter transactions, bills, and budgets into live collections.
- `src/lib/family-hub/appState.ts`
  - `completeUserSetup()` writes setup-derived seed data directly into production state.
  - `createResetState()` rebuilds the entire app from those baked-in defaults.
- `src/components/family-hub/SetupWizard.tsx`
  - The wizard language explicitly frames onboarding inputs as data that will be seeded into the current month.
- `src/lib/family-hub/persistence.ts`
  - Backup import merges imported state with `createInitialState()`, so default/demo scaffolding is always part of restore behavior.

## Places where UX is likely to be inconsistent because of architecture

- Tab shells are centralized in `src/FamilyHubApp.tsx`, but each screen owns its own summary-card patterns, section spacing, and microcopy.
- `HomeScreen.tsx`, `MoneyScreen.tsx`, `TasksScreen.tsx`, and `CalendarScreen.tsx` each compute their own status summaries and badges instead of sharing dashboard/list primitives.
- `CalendarScreen.tsx` handles toasts, connect modals, manual token fallbacks, and URL cleanup locally, while other screens have different ad hoc async UX patterns.
- `MoreScreen.tsx` is effectively a miscellaneous catch-all tab, so settings/admin/avatars/places/audit UX consistency depends on one screen continuing to scale.
- `src/styles.css` duplicates or layers responsive behavior in multiple breakpoint blocks, increasing the chance that the same component family behaves differently across tabs.

## Recommended refactor order

1. **Stabilize the data model layer first**
   - Extract `FamilyHubState` types, defaults, migrations, sanitizers, and persistence from `storage.ts`.
   - Add migration versioning and migration-focused tests.
2. **Remove backend ambiguity**
   - Delete or archive `server/index.ts`.
   - Add a short server README documenting the only supported runtime and env vars.
3. **Separate onboarding/setup from live domain data**
   - Keep setup inputs in `userSetupProfiles` only.
   - Generate recommended starter bills/budgets as user-accepted actions instead of automatic inserts.
4. **Refactor state management by feature**
   - Split `useFamilyHubController` into auth/setup, tasks, money, calendar, and admin hooks or reducers.
5. **Move permission enforcement downward**
   - Domain actions should reject unauthorized operations; UI should reflect permissions, not be the sole gate.
6. **Break up the largest screens**
   - Start with `MoneyScreen.tsx`, then `MoreScreen.tsx`, then `CalendarScreen.tsx`.
7. **Introduce a route model**
   - Login/setup/app-shell routes should be explicit; tabs can remain nested child navigation.
8. **Modularize styling and screen primitives**
   - Extract screen-level CSS/modules or a stricter design-token/component system.
9. **Harden client/server integration**
   - Give calendar/provider data a dedicated service and cache boundary.
10. **Only then consider bigger product changes** like sync, accounts, or mobile packaging.

## Specific guidance: do first / do not touch yet

### Do first

- Extract and test the persistence/migration layer before adding new features.
- Remove `server/index.ts` or clearly mark it unsupported.
- Create a dedicated onboarding domain so setup data stops becoming production money data automatically.
- Split `MoneyScreen.tsx` into smaller sections/components before changing money features further.
- Add authorization assertions to domain actions for money/task/calendar mutations.

### Do not touch yet

- Do **not** attempt a full backend rewrite first; the main instability is currently in client-state architecture.
- Do **not** add more tabs or major feature areas to `MoreScreen.tsx`.
- Do **not** introduce multi-device sync until the client data model and permissions are formalized.
- Do **not** restyle the entire app before component and CSS boundaries are clearer; otherwise visual churn will mask structural progress.
- Do **not** replace everything with a heavyweight stack in one step. The repo can improve incrementally if boundaries are established first.
