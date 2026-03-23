# Family Hub QA and Regression Test Matrix

## Purpose

This matrix defines a repeatable QA plan for the current Family Hub application covering authentication, onboarding, Home, Calendar, Money, Tasks, rewards/gamification, profile/settings, notifications/alerts, family switching/member views, responsive behavior, permission controls, and empty/loading/error states. It is based on the current product surface in the React app, including PIN-based profile unlock, setup wizard, role-based tab visibility, connected calendar sync, money workflows, task completion rewards, reminders, and household settings. 

## Priority legend

- **P0** — release-blocking; core household use is broken or unsafe.
- **P1** — high-value regression; major feature works incorrectly but has a workaround.
- **P2** — important polish/secondary regression.
- **P3** — optional exploratory coverage.

## Test environments

- **Desktop web**: latest Chrome, Safari, Firefox, Edge.
- **Mobile web**: iPhone Safari width, Android Chrome width, narrow responsive browser viewport.
- **Roles**: parent/admin, adult/editor, child/limited.
- **Calendar modes**: `local` and `server` when available.
- **Data profiles**:
  - brand-new household / empty state,
  - fully configured household,
  - child account with restricted access,
  - household with overdue bills, due tasks, and connected calendars,
  - malformed import / sync failure data.

---

## 1) Authentication

| Item | Details |
| --- | --- |
| Critical user journeys | Select profile from login screen; unlock existing profile with 4-digit PIN; recover by clearing PIN and restarting setup; lock app from top bar/Home/Settings and switch profiles. |
| Expected behavior | Only active household profiles appear; users without setup are routed to setup; 4 digits trigger unlock; wrong PIN shows an error and clears entry after shake animation; lock returns to profile chooser; restart removes only that profile's PIN/setup on the current device. |
| Failure modes | Correct PIN rejected; wrong PIN unlocks account; user stays half-authenticated after lock; restart clears wrong profile; error state persists after switching users; child can bypass PIN flow via stale state. |
| Edge cases | Multiple rapid taps on keypad; backspace on empty PIN; switching profile mid-entry; profile with setup complete but missing stored PIN; app refresh during unlock; lock while unsaved work exists in another tab. |
| Priority | **P0** |
| Manual test steps | 1. Open Family Hub with at least one set-up and one unconfigured user. 2. Select configured user and enter correct PIN. 3. Lock app and confirm return to profile chooser. 4. Re-enter using wrong PIN and verify error plus reset. 5. Switch to another profile and ensure prior PIN digits/errors are cleared. 6. Use “I need help with my PIN” and confirm only selected profile is reset. |

## 2) Onboarding

| Item | Details |
| --- | --- |
| Critical user journeys | Start setup from login; create PIN; confirm PIN; skip optional money basics; seed recurring payments and budgets; finish setup and enter app; restart setup for an existing user. |
| Expected behavior | Wizard progresses through six steps; invalid PIN length blocks step 2; mismatched confirmation blocks step 3; money fields are optional; valid money/profile inputs seed opening balance, income, recurring bills, and budget categories; finish signs in the user immediately. |
| Failure modes | Wizard skips validation; finish hangs without feedback; optional money inputs create corrupt records; setup completion not persisted; restart leaves stale seeded money data; back/skip buttons jump to wrong step. |
| Edge cases | Decimal values with comma separator; blank optional sections; duplicate recurring labels; many added rows; browser refresh during step 5/6; setup on child profile versus adult profile. |
| Priority | **P0** |
| Manual test steps | 1. Choose a user with no PIN/setup. 2. Progress through each wizard step using both valid and invalid inputs. 3. Try continuing with fewer than 4 PIN digits. 4. Confirm mismatched PIN creates a blocking error. 5. Complete setup with no money data. 6. Repeat with opening balance, monthly income, recurring bills, and budget categories. 7. Verify the user lands inside Family Hub and seeded money records appear in Money. |

## 3) Home screen

| Item | Details |
| --- | --- |
| Critical user journeys | Review Today overview; inspect due tasks/upcoming events/money snapshot; use companion care actions; lock and switch profile from Home; verify first-day empty guidance. |
| Expected behavior | Home summarizes overdue bills, tasks due today, upcoming internal/external calendar events, recent audit activity, safe-to-spend, and companion/family progress; care actions update companion state; first-day state shows calm empty messaging when no content exists. |
| Failure modes | Wrong priority card shown; external calendar items missing from Home; care action does not persist; safe-to-spend displays for child when money should be hidden elsewhere; lock button fails. |
| Edge cases | No tasks/bills/events; only overdue bills; only external events; very large audit log; timezone-sensitive event dates near midnight; companion missing for active user. |
| Priority | **P1** |
| Manual test steps | 1. Log in as an adult with mixed data. 2. Verify headline changes when overdue bills exist. 3. Complete/clear data sets and confirm Home changes to calm empty messaging. 4. Trigger each care action and verify the companion state/reaction updates. 5. Lock from Home and sign back in. |

## 4) Calendar

| Item | Details |
| --- | --- |
| Critical user journeys | Quick-add internal family event; add event via modal; switch day/week/month views; filter by provider; connect Google/Microsoft/ICS; sync all; clear provider data; handle OAuth/manual-token fallback; react to callback sync in URL. |
| Expected behavior | Internal events appear immediately; day/week/month navigation is stable; provider filters change displayed events only; adults can connect external calendars; children can view/edit allowed family events but cannot connect providers; sync success updates counts and last synced time; clear removes that provider's calendars/events only. |
| Failure modes | Duplicate or missing events after sync; stuck syncing spinner; provider callback not handled; ICS/manual token submission accepted with bad data but nothing loads; child can connect provider; clear removes unrelated providers. |
| Edge cases | No calendars returned by provider; provider returns zero events; sync error message from API; same event across sources; all-day versus timed event rendering; month cells outside current month; reconnect after prior clear; server/local mode differences. |
| Priority | **P0** |
| Manual test steps | 1. Add a simple family event using Quick add. 2. Open More details modal and save another event. 3. Switch between day/week/month and navigate previous/next. 4. Apply each source filter. 5. As an adult, connect/sync each available provider path in the environment. 6. Force a sync failure and verify error banner/toast. 7. Clear one provider and confirm only that provider data disappears. 8. Repeat key access-control checks as a child user. |

## 5) Money

| Item | Details |
| --- | --- |
| Critical user journeys | Review overview metrics; add/edit/duplicate/delete bill; mark bill paid and create linked transaction; manage monthly recurring bills; add/edit/delete transaction; import statement transactions; add/update/delete budgets; review goals and safe-to-spend; validate role-based hidden/summary/full visibility. |
| Expected behavior | Money uses cents-based calculations; overview totals reconcile with bills/transactions/budgets; marking a monthly bill paid generates the next instance once; transaction filters/search work; statement import highlights warnings/fixes before import; child view follows `hidden` or `summary` access; editing is disabled when permissions do not allow it. |
| Failure modes | Wrong totals due to cents conversion; duplicate recurring bill generation; paid bill not linked/unlinked correctly; deleting bill or transaction leaves orphaned link; statement import creates duplicate/invalid rows; summary-only users see edit controls; data reset wipes too much or too little. |
| Edge cases | Negative net balance; no budgets; no bills; overdue and due-soon mixes; many transactions; imported rows with ambiguous debit/credit columns; monthly boundary and `monthlyStartDay`; opening balance only; child view with `hideMoneyForKids = false`. |
| Priority | **P0** |
| Manual test steps | 1. Open Money as an adult and verify overview numbers. 2. Add a bill, duplicate it, edit it, and mark it paid. 3. Confirm linked transaction appears when expected. 4. Add inflow and outflow transactions and verify filters/search. 5. Import a sample statement with valid and invalid rows, review warnings, and import only valid rows. 6. Add/update/delete a budget and verify progress cards. 7. Switch to a child profile and verify hidden/summary behavior plus disabled editing. |

## 6) Tasks / chores

| Item | Details |
| --- | --- |
| Critical user journeys | Add task; edit task; assign to self/other when allowed; create shared task; toggle completion; verify recurrence behavior; filter ready/mine/shared/done/all; review grouped sections. |
| Expected behavior | Non-empty title required; tasks appear in correct groups (overdue/today/upcoming/waiting/done); completing recurring task increments history and advances due date while keeping task active; shared and personal completions trigger different celebration copy; child edit access follows permission rules. |
| Failure modes | Task lands in wrong group; recurrence duplicates instead of advancing; task completion not persisted; user without assign rights can reassign owner; edit modal saves stale data; completed tasks disappear from history unexpectedly. |
| Edge cases | No due date; overdue task; daily and weekly recurrences; shared task completed by non-owner; toggling completed task back to incomplete; many tasks across filters; active user with no personal tasks. |
| Priority | **P0** |
| Manual test steps | 1. Add a task due today, one overdue, one without date, and one shared task. 2. Verify grouping and filter chips. 3. Edit a task’s owner/notes/recurrence. 4. Complete each type and confirm celebration plus regrouping. 5. Re-open recurring task next due date and completion count/history. 6. Repeat assignment restrictions with a child profile. |

## 7) Rewards / gamification

| Item | Details |
| --- | --- |
| Critical user journeys | Complete task to earn coins/stars; add calendar event to earn planning progress; mark bill paid to contribute to money challenge; open Companion home; perform care actions; verify family challenge completion unlocks track rewards. |
| Expected behavior | Reward history records recent actions; companion coins/stars/level/stats update according to action type; family challenge progress increments by category; completed challenge adds unlock reward and history entry; companion home works even if 3D fallback is used. |
| Failure modes | Rewards not granted; challenge progress increments twice; wrong user receives credit; challenge completion does not unlock theme/room item; reward history overflows incorrectly; care actions overwrite unrelated stats. |
| Edge cases | Shared task contribution by multiple users; challenge already completed; no companion loaded; rapid repeated toggles/saves; reduced-motion or unsupported-device companion fallback. |
| Priority | **P1** |
| Manual test steps | 1. Record current companion coins/stars/challenge counters. 2. Complete a personal task and then a shared task. 3. Add a family calendar event. 4. Mark a bill paid. 5. Open Companion/More views and verify cumulative progress and reward history. 6. Trigger each care action and ensure stats change without breaking earned rewards. |

## 8) Profile / settings

| Item | Details |
| --- | --- |
| Critical user journeys | Change PIN; change family tone setting; export backup; import backup; lock session; restart setup; reset session/calendar/money/hard reset; inspect safety log. |
| Expected behavior | PIN change requires current PIN and matching new PINs; status banners clearly show success/failure; adults can export/import backups; only permitted roles can reset data or restart setup; hard reset requires second confirmation; safety log shows latest sensitive actions. |
| Failure modes | Wrong current PIN still changes PIN; import crashes app; hard reset without confirmation; child sees backup/reset actions; status banners misleadingly show success after failure; restart setup available to unauthorized user. |
| Edge cases | Clipboard unavailable for export; invalid JSON backup; import from older version; lock during pending status; reset one domain only; parent-required reset setting toggled. |
| Priority | **P0** |
| Manual test steps | 1. Open Settings as adult. 2. Attempt PIN change with wrong current PIN and mismatched confirmation. 3. Complete valid PIN update and re-login with new PIN. 4. Export backup and validate clipboard/download fallback. 5. Import a valid and then invalid backup file. 6. Exercise session, calendar, money, and hard reset flows. 7. Repeat visibility checks as child and confirm restrictions. |

## 9) Notifications / alerts

| Item | Details |
| --- | --- |
| Critical user journeys | Review Today and This week reminder groups; verify tasks and internal/external calendar items appear; distinguish urgent task reminders from normal event reminders. |
| Expected behavior | Alerts tab aggregates upcoming events plus incomplete dated tasks; Today includes items scheduled today; This week includes future 7-day items; task cards show urgent styling; empty reminder groups show calm fallback copy. |
| Failure modes | Missing tasks/events; wrong day bucket due to date parsing; urgent styling not applied; stale completed tasks continue appearing; alerts silently exclude external provider events. |
| Edge cases | No reminders; only tasks; only external events; invalid dates in imported data; timezone-crossing external events; many reminders overflowing layout. |
| Priority | **P1** |
| Manual test steps | 1. Populate dated tasks and events for today and the coming week. 2. Open Alerts and verify grouping/order. 3. Mark a task complete and confirm it disappears. 4. Add an external calendar event and verify inclusion. 5. Clear all upcoming items and validate empty-state copy. |

## 10) Family switching / member views

| Item | Details |
| --- | --- |
| Critical user journeys | Switch profiles from lock action; verify per-user data visibility; inspect Family members summary; confirm active role label and setup/PIN status; verify child versus adult tab sets. |
| Expected behavior | Lock always returns to chooser; selected user sees their own companion and task emphasis; family member cards show setup/PIN/role/level status; child profile hides Money tab unless money is intentionally exposed via settings; top bar and Home reflect active user name. |
| Failure modes | Cross-user data leakage; wrong active user after lock/unlock; member summary misreports PIN/setup; tabs do not change with role; stale active user name persists in top bar. |
| Edge cases | User with pending setup; inactive user; child with money-summary override; rapid profile switching; restarting setup for active user. |
| Priority | **P0** |
| Manual test steps | 1. Unlock each household member in turn. 2. Verify top bar name, role-sensitive tabs, and companion/task focus change. 3. Open Family members summary and check setup/PIN/level pills. 4. Lock and switch repeatedly between adult and child users to confirm no state bleed. |

## 11) Mobile responsiveness

| Item | Details |
| --- | --- |
| Critical user journeys | Use login, setup, navigation, composer modals, calendar week/month, money tabs, tasks filters, and settings actions on narrow screens. |
| Expected behavior | Primary actions remain visible and tappable; bottom navigation stays usable; calendar view tabs/filter chips wrap gracefully; forms do not overflow phone frame; modals remain scrollable; key status banners and toasts are readable. |
| Failure modes | Horizontal overflow; clipped buttons; inaccessible form fields beneath keyboard; modal actions off-screen; calendar grid unusable; bottom nav overlaps content; touch targets too small. |
| Edge cases | 320px width; landscape phone width; long translated/text-heavy content; large datasets in week/month calendar and transaction lists; browser zoom at 200%. |
| Priority | **P0** |
| Manual test steps | 1. Test at 320px, 375px, 390px, and tablet widths. 2. Complete login and setup entirely on narrow view. 3. Open every top-level screen and each main modal/composer. 4. Scroll all long content sections. 5. Verify no clipped controls, overlap, or horizontal scrolling. |

## 12) Permissions / access control

| Item | Details |
| --- | --- |
| Critical user journeys | Verify role-based tabs; confirm child cannot connect calendars; confirm money visibility/editing rules; confirm reset/export/restart restrictions; verify task assignment differences; validate role guard routing when URL/tab changes. |
| Expected behavior | Parent/admin and adult/editor have full tabs and management actions; child/limited lacks Money tab by default, cannot connect external calendars, cannot export/reset app data, and sees limited messaging; role guard never exposes blocked screen content. |
| Failure modes | Hidden controls still callable; child reaches blocked route directly; adult reset rights ignore `requireParentForReset`; money summary/hidden state inconsistent across components; assignment or PIN management allowed to wrong role. |
| Edge cases | Child with money visibility override; adult when parent reset requirement disabled; direct URL deep link to hidden tab; stale permissions after settings change or profile switch. |
| Priority | **P0** |
| Manual test steps | 1. Test parent, adult, and child profiles. 2. Compare visible tabs and action buttons per role. 3. Attempt blocked actions from UI and direct URL/query changes where possible. 4. Toggle relevant settings and re-test. 5. Confirm blocked flows show safe messaging rather than broken states. |

## 13) Empty / loading / error states

| Item | Details |
| --- | --- |
| Critical user journeys | Use app with no data; observe setup/login validation errors; simulate calendar sync failures; test statement import parsing errors; test invalid backup import; confirm loaders during unlock, setup save, sync, and import. |
| Expected behavior | Each screen presents a meaningful empty state with a next action; loaders show while async actions are active; errors are visible, specific, and recoverable; retry paths work without page reload. |
| Failure modes | Blank panels; infinite spinner; stale success banner after error; app crash on malformed import/sync response; modal cannot be dismissed after failure. |
| Edge cases | Empty household after reset; no connected calendars; no tasks/bills/events; provider returns zero calendars; invalid JSON import; partially parsed statement; network drop mid-sync. |
| Priority | **P0** |
| Manual test steps | 1. Start from empty state and visit each major screen. 2. Force wrong PIN, mismatched onboarding PIN, calendar sync error, invalid backup import, and statement import error. 3. Confirm error copy, recovery actions, and dismissal behavior. 4. Repeat async flows under slow network throttling if possible. |

---

## Smoke test suite

Run this suite on every deploy candidate and after any hotfix touching shared state, routing, or permissions.

### Smoke tests (must pass)

1. **Authentication smoke (P0)**
   - Unlock an existing adult profile with valid PIN.
   - Reject invalid PIN and recover cleanly.
   - Lock and switch to another profile.
2. **Onboarding smoke (P0)**
   - Start setup for a fresh user, create/confirm PIN, skip optional money steps, finish successfully.
3. **Home smoke (P1)**
   - Verify Home renders without crash for populated household and shows at least one task/event/money summary card.
4. **Calendar smoke (P0)**
   - Quick-add family event and verify it appears in day/week/month contexts.
   - For environments with external providers configured, sync one provider successfully.
5. **Money smoke (P0)**
   - Add a bill, mark it paid, and verify overview totals update.
   - Add a manual transaction.
6. **Tasks smoke (P0)**
   - Add a task, complete it, and confirm it moves state appropriately.
7. **Rewards smoke (P1)**
   - Confirm task completion changes companion/reward history or challenge progress.
8. **Settings smoke (P0)**
   - Change PIN successfully, then re-authenticate with the new PIN.
9. **Alerts smoke (P1)**
   - Verify an upcoming task/event appears in Alerts.
10. **Permissions smoke (P0)**
   - Sign in as child and confirm restricted tabs/actions are hidden or disabled.
11. **Responsive smoke (P0)**
   - Repeat login, bottom-nav switching, task add, and bill add on mobile-width viewport.

---

## Release gate checklist

A release should not ship until every applicable item below is explicitly checked.

### Functional gate

- [ ] All smoke tests pass in the target environment.
- [ ] P0 manual regression areas pass for at least one adult and one child profile.
- [ ] No broken top-level navigation path (Login, Setup, Home, Calendar, Tasks, Money, More).
- [ ] Calendar add/sync/clear flows succeed or fail gracefully with visible user feedback.
- [ ] Money calculations reconcile for sample data after add/edit/delete/import flows.
- [ ] Task completion and recurrence update state correctly.
- [ ] Reward/challenge progress still increments from task, calendar, and money actions.
- [ ] Backup export/import and reset flows behave safely.

### Access and safety gate

- [ ] Child profile cannot access blocked screens or destructive settings.
- [ ] Adult/parent role differences honor `requireParentForReset` and money visibility rules.
- [ ] No cross-profile leakage after locking/switching users.
- [ ] Sensitive actions show confirmation and audit trail where expected.

### UX gate

- [ ] Empty states are populated with guidance, not blank containers.
- [ ] Loading states are visible and dismiss when complete.
- [ ] Error states are actionable and not misleading.
- [ ] Mobile-width layout has no blocking overflow or clipped primary actions.

### Regression evidence gate

- [ ] Test notes captured for all failed/waived cases.
- [ ] Known issues documented with severity and workaround.
- [ ] Any skipped provider-specific test is marked with environment reason (`local`/`server`, missing credentials, etc.).

---

## High-risk areas requiring repeated regression checks

Re-run these areas after any change to shared state shape, routing, persistence, permissions, or UI composition.

1. **Authentication + setup persistence**
   - Shared state controls login, setup completion, active user, and seeded money data.
   - Breakage here blocks every user from entering the app.
2. **Role-based access control**
   - Permissions are cross-cutting across tabs, connect actions, money visibility, reset tools, and setup restart.
   - Re-test whenever settings, routing, or role mappings change.
3. **Calendar sync + provider integration**
   - Mixes external async providers, local/server modes, dedupe logic, URL callback handling, and provider clearing.
   - Re-test after integration, persistence, or routing changes.
4. **Money calculations and linked records**
   - Bills, transactions, budgets, statement imports, recurring generation, and overview metrics all depend on shared calculations.
   - Re-test after any money-domain, import, or storage migration change.
5. **Task completion + recurrence + rewards coupling**
   - Tasks are linked to rewards/challenges and recurrence rules; regressions are easy to miss if only task list visuals are tested.
6. **Backup/import/reset paths**
   - High blast radius because they can alter or wipe multiple domains at once.
   - Must be re-tested after storage schema, migrations, or server-backed integrations change.
7. **Mobile layout on dense screens**
   - Calendar, Money, and Settings have the highest control density and are most likely to regress from styling/layout work.
8. **Alerts/Home aggregation views**
   - These summarize multiple domains and frequently expose hidden regressions before users navigate deeper.

---

## Suggested regression cadence

- **Every commit affecting one feature area**: run that area’s P0/P1 matrix plus smoke suite.
- **Every release candidate**: run full smoke suite + all high-risk areas + mobile responsive pass.
- **Any storage or permission change**: re-run authentication, onboarding, family switching, permissions, settings/reset/import, and money regression sets.
- **Any calendar integration change**: re-run calendar, Home aggregation, Alerts, and permissions for child/adult roles in both supported calendar modes where possible.

