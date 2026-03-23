# Family Hub information architecture redesign — 2026-03-23

## Design direction

This proposal rebuilds the top-level information architecture around the real questions a household asks several times a day instead of around the current module boundaries.

### Main family questions

1. **What matters today?**
2. **What needs attention?**
3. **What is on the calendar?**
4. **What needs doing?**
5. **What is happening with money?**
6. **What progress, rewards, or family activity is happening?**

### Product principles

- **Mobile-first:** every primary destination must work as a thumb-friendly single-column experience first.
- **Calm:** show only the next useful decision, not every tool at once.
- **Modern and fun:** use positive language, progress moments, and lightweight celebration without turning the app into a game everywhere.
- **Household-safe:** keep sensitive details visible only when needed and avoid mixing admin tools into everyday family flows.
- **Action-oriented:** each section should answer a question and suggest the next best action.

---

## Proposed site map

```text
Family Hub
├─ Home / Today
│  ├─ Today summary
│  ├─ Needs attention strip
│  ├─ Next up on calendar
│  ├─ Today tasks
│  ├─ Money pulse
│  └─ Family progress highlights
├─ Attention
│  ├─ Urgent
│  ├─ Soon
│  ├─ Waiting / follow-up
│  └─ Completed today
├─ Calendar
│  ├─ Agenda
│  ├─ Week
│  ├─ Month
│  ├─ Family events
│  └─ Connected calendars
├─ Tasks
│  ├─ Today
│  ├─ Upcoming
│  ├─ Routines
│  ├─ By person
│  └─ Done
├─ Money
│  ├─ Overview
│  ├─ Bills
│  ├─ Spending
│  ├─ Budget
│  └─ Goals
├─ Progress
│  ├─ Rewards & streaks
│  ├─ Family activity
│  ├─ Savings progress
│  └─ Wins this week
└─ Household
   ├─ Family members
   ├─ Places & lists
   ├─ Reminders settings
   ├─ Connections
   ├─ Security & data
   └─ App settings
```

### Rationale

- **Home / Today** becomes the answer to “what matters today?” instead of a generic landing page.
- **Attention** is a dedicated triage space for “what needs attention?” so urgency is no longer scattered across Home, Tasks, Money, and reminders.
- **Calendar** remains distinct because schedule browsing and planning are a primary family behavior.
- **Tasks** remains distinct because execution is different from planning; it needs a focused work surface.
- **Money** remains distinct because it carries privacy and deeper workflows, but its structure should begin with “Are we okay?” not accounting detail.
- **Progress** earns a top-level place because rewards, streaks, and family momentum are part of ongoing engagement, not miscellaneous extras.
- **Household** becomes a utility space for lower-frequency management tasks; it should not compete with daily-use destinations.

---

## Primary navigation model

## Recommended primary tabs (mobile bottom navigation)

1. **Today**
2. **Attention**
3. **Calendar**
4. **Tasks**
5. **More**

### Why only five bottom-nav items

- Five items is the practical ceiling for mobile thumb navigation.
- **Money** and **Progress** are both important but not equally frequent for every household every hour.
- A bottom nav should optimize for daily repetition, not for completeness.

## Recommended “More” sheet / hub entries

Inside **More**, show large tiles in this order:

1. **Money**
2. **Progress**
3. **Household**

### Rationale

- **Today**, **Attention**, **Calendar**, and **Tasks** map directly to the most common repeat questions.
- **Money** is important, but many families check it less often than today’s plan or tasks; putting it one tap away reduces visual noise while keeping it prominent.
- **Progress** is valuable for delight and reinforcement, but should not displace the core execution flows from the main bar.
- **Household** is explicitly demoted to a utility destination so settings and admin tools stop hijacking the emotional center of the product.

## Optional large-screen adaptation

On tablet/desktop, convert the bottom nav into a left rail with direct entries for:

- Today
- Attention
- Calendar
- Tasks
- Money
- Progress
- Household

### Rationale

- Larger screens can safely expose more destinations without increasing cognitive load.
- The underlying IA stays the same; only the navigation container changes.

---

## Secondary navigation model

## Today

Use stacked modules with “See all” links instead of tabs.

- Needs attention
- Next events
- Today tasks
- Money pulse
- Family progress

**Rationale:** Home should feel glanceable, not like another multi-tab workspace.

## Attention

Use segmented controls:

- **Urgent**
- **Soon**
- **Waiting**
- **Done today**

Cross-source cards can come from bills, tasks, calendar prep items, approvals, and reminders.

**Rationale:** urgency should be organized by time pressure, not by feature type.

## Calendar

Use a top segmented switch:

- **Agenda**
- **Week**
- **Month**

Secondary filters:

- Family only
- Connected calendars
- By person

**Rationale:** view mode is the main calendar choice; source filters are secondary.

## Tasks

Use segmented controls:

- **Today**
- **Upcoming**
- **Routines**
- **Done**

Optional filter chip row:

- All
- Mine
- Family
- By person

**Rationale:** task users decide first by timing, then by ownership.

## Money

Use section tabs inside the Money workspace:

- **Overview**
- **Bills**
- **Spending**
- **Budget**
- **Goals**

**Rationale:** keep high-sensitivity, detailed finance tools nested in a single protected workspace instead of split across the whole app.

## Progress

Use swipable cards or chips:

- Rewards
- Streaks
- Savings wins
- Family moments

**Rationale:** progress should feel lightweight and celebratory rather than administrative.

## Household

Use a grouped list, not tabs:

- Family members
- Places & lists
- Connections
- Security & data
- Settings

**Rationale:** these are infrequent utility tasks; a simple grouped list is easier than another layer of tab complexity.

---

## Recommended dashboard / home layout

## Home = “Today” screen

### Mobile-first layout order

1. **Good morning / good afternoon header**
   - Greeting
   - Household status line
   - One primary CTA: “Start today” or “Review attention”

2. **Top focus card**
   - Single biggest item that matters now
   - Examples: overdue bill, school event today, task due now, budget warning

3. **Needs attention strip**
   - Maximum 3 cards
   - Ordered by urgency
   - Each card deep-links into Attention, Money, Calendar, or Tasks

4. **Today timeline**
   - Next 3–5 events and tasks together in chronological order
   - Include school, appointments, pickup, dinner plan, chores due today

5. **What needs doing today**
   - Personal tasks first, then family/shared tasks
   - Show no more than 4 visible items before “See all”

6. **Money pulse**
   - Simple household answer: safe / watch / act now
   - Next bill due
   - Weekly spending note
   - No ledger details on Home

7. **Progress & wins**
   - Streaks, avatar/reward progress, savings progress, family challenge
   - Keep visually playful but compact

8. **Quick add row**
   - Add event
   - Add task
   - Log expense / bill
   - Add family note

### Content rules

- Show **only one hero card**.
- Cap each module to **3–5 items**.
- Prefer **plain-language summaries** over raw data.
- Pull all urgent items into **Attention**; do not repeat long lists on Home.
- Hide admin and settings actions from the dashboard.

### Rationale

- Families open the app to orient quickly, not to browse full feature sets.
- Combining today’s tasks and events into a timeline matches how households actually think about the day.
- Money belongs on Home only as a pulse, because detailed finance review is a separate mental mode.
- Progress belongs low on the screen so it rewards engagement without distracting from core responsibilities.

---

## Old-to-new screen mapping

| Current area | New destination | Decision | Rationale |
|---|---|---|---|
| Home | Today | Keep and refocus | Current Home already tries to summarize priorities, events, money, and family status; it should become a tighter “what matters today?” dashboard. |
| Calendar | Calendar | Keep, simplify | Calendar is already a core user intent area and should stay a primary destination. |
| Tasks | Tasks | Keep, reorganize | Tasks should focus on timing and ownership, not on all edit tools at once. |
| Money | Money | Keep, deepen as workspace | Money already contains several useful subareas, but it should begin with calm status and protected detail layers. |
| More > reminders | Attention | Promote and merge | Reminder/soon-due content is more useful as a cross-app attention queue than as a subtab buried in More. |
| More > avatars | Progress | Promote and expand | Companion/reward features are engagement drivers and fit better under a broader progress destination. |
| More > places | Household | Demote | Places are useful but infrequent; they belong in utility space, not daily navigation. |
| More > users | Household | Demote | Family member management is administrative and should live in Household. |
| More > settings | Household | Demote | Security, import/export, reset, and setup tools are low-frequency utility flows. |
| Login / setup flow | Onboarding / auth (outside app nav) | Separate | These should remain outside the everyday information architecture. |

### Rationale

- The current app has five primary tabs, but one of them is a catch-all “More/Family” bucket. That bucket forces users to remember where hidden features live instead of matching real-life questions.
- The new mapping promotes only the pieces with recurring emotional or practical value: **Attention** and **Progress**.
- Administrative and setup flows are intentionally pushed down into **Household** so the core product feels lighter.

---

## Screens to merge

1. **More > reminders** + overdue task summaries + money urgency strips + calendar prep alerts → **Attention**
   - **Rationale:** users do not care which module produced the problem; they care what requires action next.

2. **Avatar home / companion status** + rewards + family challenge + savings progress highlights → **Progress**
   - **Rationale:** these are all motivation loops and should reinforce one another instead of living in separate corners.

3. **Home upcoming events** + **Tasks due today** into a shared **Today timeline** block
   - **Rationale:** households experience the day as one sequence, not as separate calendar and task universes.

4. **Money savings** + savings progress highlights on Home → **Progress** card plus deep link to **Money > Goals**
   - **Rationale:** financial goals have both emotional and practical value; summary belongs in progress, detail belongs in money.

5. **Connections inside Calendar** + provider/configuration tools from settings → **Household > Connections**
   - **Rationale:** account/link management is a utility concern; sync status can remain visible in Calendar, but setup should move out.

---

## Screens to remove

1. **Standalone “More” as a content bucket**
   - Replace it with a lighter **More** launcher that points to Money, Progress, and Household.
   - **Rationale:** buckets are not information architecture; they are a sign the IA is unfinished.

2. **Deep standalone reminder screen concept** if it only repeats task/event lists
   - Replace with **Attention** queue and contextual deep links.
   - **Rationale:** one triage surface is better than separate reminder-only maintenance.

3. **Any separate family summary screen that only duplicates Home crew/status cards**
   - Keep lightweight family highlights on Today and move management into Household.
   - **Rationale:** summary and management should not each own their own screen unless they solve different questions.

---

## Screens to demote

1. **Family members** → Household
   - **Rationale:** important but infrequent.

2. **Places / outing ideas** → Household
   - **Rationale:** useful reference content, not daily workflow.

3. **Security, PIN, import/export, reset, restart setup** → Household > Security & data
   - **Rationale:** highly sensitive, low-frequency tasks should be intentionally out of the main path.

4. **Calendar connection setup** → Household > Connections
   - **Rationale:** setup belongs in configuration; synced results belong in Calendar.

5. **Detailed money transaction management** from default Home visibility → Money workspace only
   - **Rationale:** protects focus and privacy.

---

## Redundant or low-value screens / patterns

1. **Catch-all utility tabs**
   - Redundant because they ask the user to remember product structure rather than follow intent.

2. **Repeated urgency summaries across Home, Money, Tasks, and reminders**
   - Low-value because they duplicate content and create noisy contradictions.

3. **Full-width detailed forms on the same screen as long lists**
   - Low-value on mobile because they overload the screen and increase scroll fatigue.

4. **Settings and admin actions mixed into family-facing spaces**
   - Low-value because they add anxiety and visual clutter to everyday use.

5. **Too many equal-weight cards on Home**
   - Low-value because a dashboard should prioritize, not merely aggregate.

---

## How to reduce cognitive load

1. **Design around questions, not objects**
   - Users think “what matters now?” before they think “open calendar module.”

2. **Create one cross-app attention queue**
   - Put all urgent or soon-due items into one place and link back to source screens.

3. **Limit Home to a few modules with explicit caps**
   - One hero, three attention cards, one timeline, one task block, one money pulse, one progress block.

4. **Use progressive disclosure everywhere**
   - Summary first, details on tap, edit controls one level deeper.

5. **Separate doing from configuring**
   - Daily work lives in Today, Attention, Calendar, Tasks, and Money; setup/admin lives in Household.

6. **Use consistent secondary patterns**
   - Segmented controls for workspaces, chip filters for scope, grouped lists for utilities.

7. **Reduce repeated data labels**
   - Say “Due tomorrow” instead of repeating category, source, and timestamp metadata in every card.

8. **Use plain-language household states**
   - Examples: “All good,” “Needs a look,” “Act today.”

9. **Default to the smallest useful summary**
   - Especially in Money and Progress, show the answer before the breakdown.

10. **Keep celebration compact**
   - Rewards and fun elements should lift mood, not interrupt task completion.

---

## Mobile-first interaction recommendations

1. **Bottom nav for primary destinations** with large tap targets and labels.
2. **Single-column default layouts**; only split into grids on larger screens.
3. **Sticky top context bar** on Today and Attention for date, household state, and quick add.
4. **Bottom sheets for quick add/edit** instead of inline forms pushing content far down.
5. **Segmented controls over sidebars** for workspace switching.
6. **Swipeable cards** only for optional progress/reward surfaces, not critical actions.
7. **Large status chips** for urgency, role, and ownership instead of dense text.
8. **One-handed priority actions** anchored near the bottom on key screens.
9. **Hide low-frequency filters behind a sheet** on mobile.
10. **Use motion sparingly** to keep the app calm.

### Rationale

- Most family coordination happens in the flow of real life, often one-handed and under time pressure.
- Mobile layouts must prioritize scanning, tapping, and returning to the day quickly.
- Calm UX comes from fewer choices per screen, not from muted visuals alone.

---

## Final recommendation summary

### New top-level mental model

- **Today** = what matters today
- **Attention** = what needs attention
- **Calendar** = what is on the calendar
- **Tasks** = what needs doing
- **Money** = what is happening with money
- **Progress** = what progress/rewards/family activity is happening
- **Household** = settings, people, places, connections, and security

### What changes most

- Replace the catch-all “More/Family” concept with a cleaner separation between **daily action** and **household utility**.
- Add **Attention** as the shared triage layer.
- Promote **Progress** from a hidden sub-area into a real engagement destination.
- Turn Home into a tighter **Today** dashboard instead of a broad feature collage.
- Move settings/admin/configuration out of everyday family flows.

### Why this is the right direction

This structure matches how a real household checks in throughout the day: orient, triage, plan, do, review money, and celebrate progress. It reduces recall burden, decreases repeated summaries, keeps privacy-sensitive tools contained, and makes the app feel more modern, playful, and calm without losing depth.
