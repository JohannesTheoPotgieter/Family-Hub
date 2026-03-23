# Family Hub task / chores / rewards redesign

## Critique

### 1. Task creation flow
- The current composer is functional but still reads like a form: title, date, owner, repeats, notes, and shared are presented with equal weight. That makes simple chores feel heavier than they need to be.
- There is no opinionated guidance toward the easiest task shape, so adults can over-specify while kids get extra metadata that does not help them act.
- The flow lacks “what good looks like” hints such as short titles, when to use shared tasks, or why dates matter.

### 2. Task assignment
- Assignment exists, but it is quiet. The screen does not strongly explain “for me”, “for someone else”, or “for everyone”.
- Child users can edit tasks, but the current UI does not visibly simplify around their main job: see what is theirs and finish it.
- Assignment feels like data ownership instead of a lightweight nudge.

### 3. Completion flow
- Completion is only a checkbox. It is fast, but emotionally flat.
- Rewards happen in state, yet the Tasks screen does not surface what a completed chore earned.
- Repeating-task behavior is powerful, but it can feel invisible because the result looks almost the same after completion.

### 4. Progress visibility
- Summary counts exist, but they are generic operational metrics.
- There is no strong “what should I do next?” lane inside the Tasks screen itself.
- Family progress and task progress live on separate surfaces, so chores can feel disconnected from visible impact.

### 5. Rewards / points / gamification
- The app already has companion XP, coins, stars, and family challenges, but the task experience does not cash those out in the moment.
- Rewards risk feeling abstract because users are asked to trust a system they cannot see while doing chores.
- Shared rewards are valuable, yet the UI does not frame shared tasks as “team wins”.

### 6. Avatar or family-progress integration
- Avatar progress is visible on Home, not where chores are completed.
- The task-to-avatar loop is therefore cognitively indirect: finish task here, notice reward somewhere else later.
- Family challenge progress is underused as a motivational bridge between individual chores and household momentum.

### 7. Mobile interaction
- The existing layout is already mobile-friendly, but task rows are still closer to a management list than a friendly action feed.
- On small screens, users benefit from a stronger first view: what is ready now, what belongs to me, and what gives an immediate sense of progress.

## Redesign plan

### Make tasks easy to understand
- Prioritize a **Ready now** default filter so the first screen is actionable instead of exhaustive.
- Add a stronger **Up next for you** card so the page starts with a single understandable next step.
- Reframe task cards with short status cues like **Best next move**, **Do together**, and **Ready today**.

### Make assignment and completion frictionless
- Keep the composer lightweight, but add guidance that nudges adults toward short, scannable titles.
- Preserve owner assignment for adults while clarifying that children should mostly see their own items.
- Turn completion into a one-tap action with clearer CTA language inside the card.

### Make rewards feel motivating
- Surface a completion banner immediately after a task is finished.
- Translate hidden reward mechanics into human feedback such as coins, stars, and “family win” language.
- Show the active companion’s level/mood inside the Tasks screen so rewards feel local, not delayed.

### Connect progress to visible family feedback
- Pull the active task-family challenge into the Tasks screen.
- Show shared open tasks and family quest progress in the toolbar area.
- Position shared chores as a cooperative loop rather than a neutral checkbox state.

### Avoid making the app feel like admin
- Reduce management tone by leading with momentum and next wins instead of counts alone.
- Keep adult controls available but visually secondary.
- Use friendly language and visible progress cards so the screen feels like a family action space, not a control panel.

## Implementation order
1. **Task information architecture**
   - Default to a “Ready now” lane.
   - Strengthen card copy and ownership cues.
2. **Reward feedback loop**
   - Add completion delight banner and task-local reward messaging.
3. **Family progress integration**
   - Pull family quest and companion boost into the Tasks screen.
4. **Adult/child balance**
   - Keep assignment controls for adults while adding child-friendly helper copy.
5. **Polish for mobile**
   - Ensure focus cards and celebration states stack cleanly on narrow screens.

## Safe migration notes
- The shipped redesign is intentionally **schema-safe**: it does not change persisted task, reward, or avatar storage structures.
- Existing tasks, recurrence rules, completion counts, and reward history continue to work without a data migration.
- If a future phase introduces task difficulty, reward previews, approval states, or child-only task views, those should be added as optional fields with defaults so older local state remains valid.
- Repeating-task completion behavior should remain backward compatible because families may already rely on the current auto-rollover pattern.
