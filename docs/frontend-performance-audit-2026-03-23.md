# Frontend Performance Audit — Family Hub

Date: 2026-03-23

## Scope

This audit focused on:
- bundle size
- route-level code splitting
- render bottlenecks
- repeated fetching
- expensive components
- unnecessary re-renders
- oversized dependencies
- image/icon inefficiencies
- mobile performance risks

## Quick measurements

### Production build

`npm run build` produced:
- `dist/assets/index-Dv7lGc7_.js`: **317.89 kB** raw / **94.48 kB gzip**
- `dist/assets/index-B78iXgZi.css`: **71.37 kB** raw / **15.88 kB gzip**

### Packaging footprint

`npm pack --json` reported:
- package tarball size: **168,804 bytes**
- unpacked size: **602,373 bytes**

### Current dependency picture

Runtime dependencies are intentionally small:
- `react`
- `react-dom`

There are **no obviously oversized third-party frontend dependencies** in `package.json` today. Most performance risk comes from app structure and monolithic screen code, not dependency bloat.

## Biggest performance problems

### 1) No route-level code splitting; the whole app ships in one entry chunk

**Why it matters**
- Every user downloads code for Home, Calendar, Tasks, Money, More, setup, login, avatar UI, statement import logic, and calendar integrations on first load.
- Mobile users pay the startup cost even if they only use one tab.

**Evidence**
- `FamilyHubApp.tsx` statically imports every major screen.
- Vite currently outputs a single application JS asset.
- The app uses internal tab state rather than route-based lazy loading.

**Likely root cause**
- Top-level static imports in the app shell.
- No `React.lazy`, `Suspense`, or Vite `manualChunks` strategy.
- Tabs are conditionally rendered but still bundled eagerly.

### 2) App-wide state updates re-render the entire shell and active feature trees

**Why it matters**
- `useFamilyHubController` owns the full `FamilyHubState` object and returns a large controller object to the top-level app.
- Any mutation persists the full state and causes `FamilyHubApp` to re-render, which recreates props for all active screens and many inline callbacks.
- Large screens then recompute filtered/derived collections.

**Evidence**
- One top-level `useState` stores the whole app state.
- State is persisted on every state change.
- `FamilyHubApp` passes large object graphs and inline callbacks to all screens.

**Likely root cause**
- Global state and UI state are coupled in one hook.
- No selector-based subscriptions.
- No memoized action object.
- Heavy derived data is computed inside presentation components instead of selectors.

### 3) Very large screen components create render and maintenance hotspots

**Highest-risk files**
- `src/components/family-hub/MoneyScreen.tsx` — 843 lines
- `src/components/family-hub/CalendarScreen.tsx` — 684 lines
- `src/components/family-hub/MoreScreen.tsx` — 554 lines
- `src/components/family-hub/HomeScreen.tsx` — 529 lines
- `src/components/family-hub/TasksScreen.tsx` — 431 lines

**Why it matters**
- Large files usually mix domain calculations, state, event handlers, and rendering.
- Even with `useMemo`, repeated array filtering/mapping happens inside render paths.
- These screens are difficult to profile and optimize incrementally.

**Likely root cause**
- Feature logic and UI composition grew inside single files.
- Missing smaller memoized leaf components and selectors.

### 4) Repeated collection scans inside render-derived calculations

**Why it matters**
- Several screens repeatedly filter/map the same arrays multiple times for summaries, groups, and widgets.
- This is fine at tiny scale but will degrade with realistic household history, imported statements, connected calendars, or larger audit logs.

**Examples**
- `CalendarScreen` rebuilds merged event lists, filtered lists, week/day/month slices, provider summaries, and month busy-day counts.
- `TasksScreen` repeatedly filters `tasks` for groups and stats.
- `HomeScreen` derives due bills, overdue bills, open tasks, upcoming events, today tasks, and recent changes from the entire app state.
- `MoreScreen` rebuilds reminder groups from events, external events, and tasks.

**Likely root cause**
- Derived data is computed ad hoc in each screen rather than normalized once per state change.
- Some memoization exists, but many memo inputs are broad objects such as the full `state` or full arrays, so cache invalidation is frequent.

### 5) Calendar sync fans out requests and can over-fetch

**Why it matters**
- `CalendarScreen.syncProvider` first loads calendars, then requests events for every calendar in parallel for a roughly 5-week window.
- `syncAllProviders` then performs provider syncs sequentially, each with its own calendar/event fan-out.
- There is no caching, no stale-time, and no deduplication guard if users trigger sync repeatedly.

**Likely root cause**
- Fetch orchestration lives directly in the component.
- No request cache, shared data layer, or background sync policy.

### 6) Toast context causes subtree updates more often than needed

**Why it matters**
- `ToastProvider` memoizes a value object that depends on the `toasts` array itself.
- Every toast add/remove changes the context value identity, so all consumers of `useToasts` re-render.
- This is not catastrophic today but is unnecessary global churn.

**Likely root cause**
- State and actions are combined into one context value.
- `push`/`remove` functions are recreated whenever `toasts` changes.

### 7) Avatar feature can become an expensive interactive region on low-end mobile devices

**Why it matters**
- The avatar scene reacts to mouse movement and inline style rotation updates.
- WebGL support detection and low-power fallback exist, but the feature still ships eagerly in the main bundle.
- If avatar assets/logic grow, this will become a startup and interaction hotspot.

**Likely root cause**
- Avatar UI is bundled with the main app rather than loaded on demand.
- Interactive rendering logic lives in component state.

### 8) CSS payload is fairly large for a small app shell

**Why it matters**
- CSS output is ~71 kB raw.
- Large global stylesheets increase parse cost and can make critical-path rendering slower on mobile.

**Likely root cause**
- Most styling lives in one large global stylesheet.
- Styles for all screens ship up front.

## Likely root causes by category

### Bundle size
- Monolithic app entry.
- Static imports for all screens.
- Heavy feature modules like statement import and calendar logic bundled eagerly.
- Large global CSS bundle.

### Route-level/code splitting
- No real route boundaries for tabs.
- No lazy imports for feature screens.
- No manual chunking for heavy utilities.

### Render bottlenecks
- Full-app state updates from one controller hook.
- Large screen components doing data derivation and rendering together.
- Broad props passed from `FamilyHubApp`.
- Inline callbacks and object literals recreated each render.

### Repeated fetching
- Calendar sync does repeated provider/calendar requests on demand.
- No cache or dedupe layer.
- Network orchestration sits inside UI component code.

### Expensive components / unnecessary re-renders
- `MoneyScreen`, `CalendarScreen`, `HomeScreen`, `MoreScreen`, and `TasksScreen` all do significant work in render paths.
- Toast context updates all consumers on each toast change.
- Entire app shell re-renders on any state mutation.

### Images/icons
- Iconography is mostly emoji/text, which is efficient.
- No image-heavy rendering path was found in `src/`.
- The primary media risk is interactive avatar rendering, not raster images.

### Mobile risks
- One large startup chunk.
- Large CSS parse cost.
- Rich, dense screens with lots of cards and lists.
- Interactive avatar region and many simultaneous panels can hurt slower devices.
- Repeated array processing becomes more visible on low-power CPUs.

## Fastest wins

### 1) Lazy-load each top-level screen

Start with:
- `HomeScreen`
- `CalendarScreen`
- `TasksScreen`
- `MoneyScreen`
- `MoreScreen`
- `SetupWizard`
- `LoginScreen`

Use `React.lazy` + `Suspense` in `FamilyHubApp.tsx`.

**Expected impact**
- Smaller initial JS for first paint.
- Better mobile startup.
- Heavy screens loaded only when needed.

### 2) Split the heaviest feature logic out of `MoneyScreen`

Highest-value extractions:
- statement import modal/workflow
- transaction list/table
- bills list/editor
- budget overview/summary selectors

**Expected impact**
- Lower render cost for the active money tab.
- Easier memoization and profiling.

### 3) Move derived selectors out of component bodies

Create selector helpers for:
- home summaries
- task grouping/statistics
- calendar merged/filtered summaries
- money overview aggregates
- reminders in More

**Expected impact**
- Fewer repeated scans.
- Easier unit testing.
- Better reuse across screens.

### 4) Memoize actions and reduce inline callback churn in `FamilyHubApp`

Candidates:
- wrap stable action groups in `useMemo`
- avoid inline lambdas for screen props when possible
- consider screen-specific controller hooks/selectors

**Expected impact**
- Fewer child re-renders.
- Cleaner profiling story.

### 5) Make toast actions stable

Refactor `ToastProvider` so action functions do not depend on `toasts`, or split state/actions across separate contexts.

**Expected impact**
- Less unnecessary context-driven re-rendering.

### 6) Debounce or guard calendar sync triggers

Add in-flight request guards and a short stale-time cache for:
- provider calendars
- event windows per calendar/provider

**Expected impact**
- Less duplicate network traffic.
- Better perceived responsiveness.

## Medium-term improvements

### 1) Introduce route-aware architecture
- Use actual routes or tab-based lazy modules.
- Persist active tab in URL without importing every screen eagerly.
- Treat each tab as its own entry boundary.

### 2) Adopt selector-based state access
- Split app state into focused contexts or stores.
- Expose selectors for calendar, tasks, money, avatars, and settings.
- Keep local UI state near each feature.

### 3) Normalize expensive domains
- Pre-index tasks by status/owner.
- Pre-index events by day/provider.
- Precompute monthly money aggregates when source data changes.

### 4) Add profiling instrumentation
- Use React DevTools Profiler on Money, Calendar, and Home flows.
- Track render counts for major panels.
- Add `performance.mark` around calendar sync and statement import parsing.

### 5) Code-split avatar and statement import logic separately
- Lazy-load avatar feature when the avatar tab opens.
- Lazy-load statement import parsing/modal only when import starts.

### 6) Reduce global CSS cost
- Split feature CSS or co-locate styles.
- Trim unused styles and repeated utility patterns.
- Consider critical-path prioritization for the login/home shell.

## Exact files and components to inspect first

### Highest priority
1. `src/FamilyHubApp.tsx`
   - Replace eager screen imports with lazy boundaries.
   - Reduce inline prop callbacks.

2. `src/lib/family-hub/useFamilyHubController.tsx`
   - Decouple global state updates from view rendering.
   - Add memoized action objects/selectors.
   - Revisit saving the entire state on every mutation.

3. `src/components/family-hub/MoneyScreen.tsx`
   - Break apart overview, bills, transactions, budgets, and statement import.
   - Precompute aggregates once per month/data change.

4. `src/components/family-hub/CalendarScreen.tsx`
   - Extract fetch/sync logic into a data layer.
   - Cache provider/calendar/event requests.
   - Pre-index events by day/provider.

5. `src/components/family-hub/HomeScreen.tsx`
   - Move dashboard selectors out of the component.
   - Avoid recomputing multiple top-level summaries from the full `state` object.

### Secondary priority
6. `src/components/family-hub/TasksScreen.tsx`
   - Consolidate grouping/stat calculations into selectors.
   - Break list sections into memoized leaf components.

7. `src/components/family-hub/MoreScreen.tsx`
   - Split sections so the active panel does not carry all logic together.
   - Lazy-load avatar section if it remains visually rich.

8. `src/ui/useToasts.tsx`
   - Stabilize context actions and reduce consumer churn.

9. `src/components/family-hub/AvatarHomeSection.tsx`
10. `src/avatar3d/AvatarScene.tsx`
   - Keep 3D/interactive code off the critical path.
   - Profile interaction cost on low-end mobile devices.

11. `src/styles.css`
   - Audit for dead styles and feature-specific CSS that can be split.

12. `src/integrations/calendar/index.ts`
   - Add request dedupe and caching semantics.
   - Keep remote data logic out of the screen component.

## Safe optimization plan

### Phase 1 — Low-risk, fast wins
1. Add lazy imports for top-level screens in `FamilyHubApp.tsx`.
2. Introduce lightweight loading fallbacks per tab.
3. Stabilize toast actions.
4. Add basic in-flight guards for calendar sync.
5. Extract pure selector helpers for Home, Tasks, and More.

**Why safe**
- Minimal behavioral change.
- Mostly structural and memoization improvements.
- Easy to validate with existing app behavior.

### Phase 2 — Moderate-risk refactors with strong ROI
1. Break `MoneyScreen` into feature subcomponents.
2. Break `CalendarScreen` into data/controller + presentational sections.
3. Add cached domain selectors for money, tasks, and calendar summaries.
4. Reduce prop surface area from `FamilyHubApp`.

**Why safe**
- Refactors can preserve current UI while reducing render work.
- Easier unit coverage around extracted selectors.

### Phase 3 — Architectural improvements
1. Move from monolithic top-level state access to feature-scoped selectors or stores.
2. Introduce route-aware loading boundaries.
3. Add profiling and performance budgets to CI/build review.
4. Consider virtualization if long money/task/event lists grow in real data.

**Why safe**
- Best done after Phase 1–2 produce measurable gains.
- Requires broader state/data architecture changes.

## Recommended order of attack

1. Lazy-load screens in `FamilyHubApp.tsx`.
2. Extract selectors from Home/Tasks/More.
3. Split `MoneyScreen` and lazy-load statement import.
4. Refactor calendar fetch/sync into a cached module.
5. Rework controller/state boundaries only after measuring the first four wins.

## Bottom line

Family Hub does **not** currently have a dependency-bloat problem. It has a **monolithic app-shell problem**:
- one startup bundle
- one large top-level state owner
- several oversized screens doing their own data derivation
- network orchestration inside UI

The fastest meaningful improvement is to **introduce lazy screen loading and extract selectors for heavy screens**. That should improve startup cost, reduce render churn, and create safer seams for deeper optimization later.
