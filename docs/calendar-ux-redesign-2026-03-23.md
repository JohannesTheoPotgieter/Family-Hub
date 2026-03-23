# Family Hub calendar UX critique and redesign plan

## UX critique

### 1. Current event display
- The previous calendar focused on a simple agenda list for one selected day, which hid the broader family schedule and made week/month understanding weak.
- Event cards exposed title and source, but not enough hierarchy to show what is shared family planning versus imported outside calendar data.

### 2. Navigation between dates and views
- The experience centered on a weekly day-strip without a true day/week/month switcher.
- Date navigation lacked clear previous/today/next controls, which increased friction on mobile and for quick scanning.

### 3. Event creation and editing flow
- Event creation required opening a modal, which slowed down quick capture.
- There was no obvious inline quick-add surface near the top of the planner.

### 4. Family member visibility
- Shared family events were not visually prioritized enough over connected calendars.
- Outside calendars were present, but the source/account connection story was not obvious in the agenda itself.

### 5. Color and status clarity
- Provider colors existed, but the main planner did not use them consistently as a clear source system.
- Empty and loading states were serviceable but not polished enough to make the planner inviting.

### 6. Mobile responsiveness
- The weekly strip and agenda worked, but the screen did not feel optimized for thumb-driven switching between day/week/month contexts.
- Controls were spread apart rather than organized into compact, tappable clusters.

### 7. Interaction friction
- Creating an event, changing time range, and understanding what is happening this month each required extra mental work.
- Connected calendar management mixed with planning, which made the overall screen feel less calm than it should.

## Improvement plan
- Establish a stronger information hierarchy with a planner hero, summary metrics, and quick-add first.
- Add clear day/week/month switching with simple previous/today/next navigation.
- Separate family planning from connected calendar administration.
- Prioritize shared family events visually and label connected sources consistently.
- Improve empty states so the calendar feels intentional even before data exists.
- Make mobile interaction more obvious with compact segmented controls and stacked responsive layouts.

## Component-level implementation plan
- **Calendar hero:** add summary cards and inline quick-add controls at the top of the screen.
- **Navigation toolbar:** introduce a range label, previous/today/next buttons, and day/week/month tabs.
- **Day view:** use richer event cards with source pills, time labels, and family/source metadata.
- **Week view:** show a tappable seven-column board that makes daily density obvious.
- **Month view:** show a compact monthly grid with event counts and short chips for scanning.
- **Connected calendars section:** keep setup and syncing in a dedicated lower section to reduce planner clutter.
- **States:** improve empty and sync feedback styling.

## File changes
- `src/components/family-hub/CalendarScreen.tsx`: redesigned the planner structure, added day/week/month views, inline quick-add, improved event hierarchy, and clearer connected-calendar separation.
- `src/styles.css`: added planner-specific layout, cards, responsive behavior, source pills, empty states, week board, and month grid styling.

## Test steps
1. Open the Calendar screen on desktop and mobile widths.
2. Verify the default week view loads and previous/today/next navigation changes the visible range.
3. Switch between day, week, and month views and confirm the selected day stays coherent.
4. Use quick add to create a family event and verify it appears in day/week/month contexts.
5. Filter by Family, Google, Outlook, and ICS where available.
6. Confirm empty states appear gracefully when there are no events or no connected calendars.
7. Connect, sync, and clear a provider to confirm the lower management section still works.
