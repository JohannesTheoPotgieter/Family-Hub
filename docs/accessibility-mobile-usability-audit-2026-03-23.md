# Family Hub accessibility and mobile usability audit — 2026-03-23

## Scope and method

This audit was performed through a practical code and style review of the current Family Hub UI, backed by a successful production build and full automated test run. Because no browser automation or screenshot tool was available in this environment, findings are based on implemented React markup, interaction patterns, and responsive CSS rather than live device testing.

Primary files reviewed:

- `src/FamilyHubApp.tsx`
- `src/ui/Modal.tsx`
- `src/components/family-hub/LoginScreen.tsx`
- `src/components/family-hub/SetupWizard.tsx`
- `src/components/family-hub/TasksScreen.tsx`
- `src/components/family-hub/CalendarScreen.tsx`
- `src/components/family-hub/MoneyScreen.tsx`
- `src/components/family-hub/MoreScreen.tsx`
- `src/styles.css`
- `src/theme.css`

## Findings summary

| # | Problem | Severity | Why it matters | Where it shows up |
|---|---|---|---|---|
| 1 | Modal dialogs are not fully accessible: no focus trap, no `aria-modal`, no explicit close control, and backdrop-click dismissal can be easy to trigger on mobile. | High | Keyboard and screen reader users can lose context, while mobile users can accidentally dismiss forms and lose work. | Calendar and statement import modals. |
| 2 | Several forms rely on placeholders or standalone headings instead of persistent labels. | High | Placeholders disappear during entry, reduce comprehension at larger text sizes, and are weaker for screen reader navigation. | Calendar modal, Money forms, Places form, PIN change form. |
| 3 | Validation and error feedback are not programmatically tied to fields. | High | Screen reader users may hear a generic error but not know which field caused it; cognitive load also increases for all users. | Login PIN flow, setup wizard, statement import, PIN change. |
| 4 | Multiple interactive controls are below recommended 44x44 tap targets. | Medium | Small targets increase accidental taps, especially for children, older adults, and one-handed phone use. | Chips, filter pills, inline action buttons, task completion toggles. |
| 5 | Responsive layouts shrink dense navigation and calendar content too aggressively on small screens. | Medium | Readability and tap accuracy degrade when five nav items, two-column calendar boards, and compact pills compete for width. | Bottom nav, More tabs, calendar week/month boards. |
| 6 | The UI uses many sub-12px equivalent text sizes and compact metadata styles. | Medium | Small text becomes hard to read on small phones, in bright light, or with modest text scaling. | Bottom nav labels, pills, weekday labels, metadata chips, helper text. |
| 7 | Keyboard support is only partial for complex widgets. | Medium | Buttons are keyboard reachable, but modal workflows and custom tab/grid patterns do not provide a complete keyboard story. | Modal flows, calendar tablist/grid, PIN keypad flows. |
| 8 | Screen reader semantics are inconsistent in custom controls and status areas. | Medium | Users may not get enough context about state changes, selected tabs, or how to exit overlays. | Custom tabs, modal dialogs, status/error banners. |
| 9 | Some interactions still depend on precision tapping rather than resilient alternatives. | Low | The app is not gesture-only, which is good, but precise taps are still required in several dense mobile regions. | Calendar day cells, chip rows, inline edit/delete actions. |

## Detailed findings

### 1) Modal dialogs need stronger mobile and assistive-tech behavior

**Problem**

`Modal` renders a dialog container with `role="dialog"` and a title label, but it does not set `aria-modal="true"`, does not trap focus, does not return focus to the trigger, and does not expose an always-visible close button. It also closes whenever the backdrop is tapped. The modal content itself is scrollable, which helps on mobile, but accidental backdrop taps can still dismiss a partially completed task. The statement import flow also places a long, multi-step review inside the same modal pattern.

**Why this matters**

- Keyboard users can tab behind the dialog.
- Screen reader users may not get a clear modal boundary.
- Mobile users can lose entered data with an accidental outside tap.
- Long modal content becomes harder to escape safely without a dedicated close affordance.

**Severity**: High

**Implementation recommendations**

1. Add `aria-modal="true"` and connect the heading with `aria-labelledby`.
2. Move focus into the dialog on open, trap it while open, and restore focus to the trigger on close.
3. Add a visible close button in the top-right corner with an explicit accessible name.
4. Support `Escape` to close where safe.
5. For destructive or multi-step mobile flows such as statement import, consider a full-screen mobile sheet instead of a center modal.
6. Avoid backdrop-click dismissal for forms with multi-step or file-upload work, or require explicit confirmation if unsaved progress exists.

### 2) Form labeling is inconsistent and often placeholder-dependent

**Problem**

Some forms are well labeled with `<label>` wrappers, but many important inputs are not. Several fields expose only placeholders or rely on nearby prose instead of persistent labels: calendar modal event title/date, ICS connection fields, money bill/transaction/budget fields, places fields, and PIN change inputs.

**Why this matters**

- Placeholders disappear while typing.
- Speech input and screen reader form navigation work better with explicit labels.
- Larger text or narrower widths make placeholder-only designs harder to scan.
- Repeated generic placeholders such as “Amount” or “Notes” are ambiguous out of context.

**Severity**: High

**Implementation recommendations**

1. Wrap every input/select/textarea in a visible `<label>` or use `id` + `htmlFor`.
2. Keep placeholders as examples, not as the primary field name.
3. Add helper text with `aria-describedby` where context is needed, such as supported import formats or PIN rules.
4. Apply this first to security, money, and calendar forms because those are the highest-risk flows.

### 3) Errors are visible, but not clearly linked to the fields that caused them

**Problem**

Errors are typically rendered as general `.error-banner` blocks. This is better than silent failure, but the fields themselves do not use `aria-invalid`, there are no `aria-describedby` relationships to error text, and most error/status blocks are not announced through `aria-live`. The login PIN flow, setup flow, and PIN change flow all show banner text without field-level association.

**Why this matters**

- Screen reader users may hear “error” but not know what to fix.
- People with cognitive load or stress benefit from direct, field-specific guidance.
- Mobile users should not have to scan a dense form to infer what failed.

**Severity**: High

**Implementation recommendations**

1. Mark invalid fields with `aria-invalid="true"`.
2. Give each error/help message an `id` and reference it from the affected field with `aria-describedby`.
3. Use `aria-live="polite"` for non-blocking status and `aria-live="assertive"` sparingly for critical failures.
4. Prefer specific messages such as “Current PIN is incorrect” or “Amount is required” next to the relevant control.
5. Move focus to the first invalid field after failed submit.

### 4) Several controls miss recommended tap target sizing

**Problem**

The base button style is good at 50px minimum height, and the PIN keypad is comfortable at 60px. However, several other controls are smaller than the widely used 44x44 CSS px recommendation:

- `.chip-action` is 40px minimum height.
- `.filter-pill` is 42px minimum height.
- `.money-inline-btn` is 34px minimum height.
- `.task-check` is 30px square in one ruleset and 34px square in another.
- route/status pills are also compact.

**Why this matters**

- Small controls are harder for thumb use and users with motor impairments.
- Dense action clusters make accidental destructive taps more likely.
- Children, who appear to be part of the product audience, especially benefit from forgiving target sizes.

**Severity**: Medium

**Implementation recommendations**

1. Raise all tappable controls to at least 44x44 CSS px.
2. Add spacing between destructive inline actions such as edit/delete.
3. Enlarge the task completion control and related action buttons first because they are frequently used.
4. Treat chips that trigger navigation or filtering as full-size buttons, not decorative pills.

### 5) Small-screen layout density is likely to hurt readability and consistency

**Problem**

The app has many responsive rules, which is good, but some patterns stay dense on very small screens:

- Bottom navigation keeps five items in one row with very small label text.
- At `max-width: 1024px`, calendar week and month boards collapse to two columns rather than a single-column stacked list, which can still feel cramped on phones.
- The More screen uses five columns at one breakpoint before later changing to two columns in another responsive block, which risks inconsistent behavior depending on cascade order and viewport.

**Why this matters**

- Phone users need stable, predictable layouts.
- Dense multi-column cards become harder to scan when text is enlarged.
- Mixed responsive strategies can create “almost fits” interfaces that feel unstable across devices.

**Severity**: Medium

**Implementation recommendations**

1. Re-audit breakpoints so that primary phone layouts favor one column for dense content.
2. Consider reducing bottom-nav label complexity or switching to icon + shorter labels only if they remain understandable.
3. For calendar week/month views on phones, prefer stacked agenda summaries over card grids.
4. Consolidate overlapping responsive rules so each component has one clear small-screen behavior.

### 6) Smaller typography choices create readability risk

**Problem**

The UI uses many compact font sizes: 0.67rem for nav labels, 0.63rem to 0.76rem for calendar dots and pills, 0.68rem for some blurbs, and several other metadata patterns below comfortable mobile reading sizes.

**Why this matters**

- Small metadata becomes effectively unreadable on compact devices.
- Low-vision users often increase text size, which can expose clipping or wrapping problems.
- Short labels become especially fragile when combined with glassmorphism and low-contrast surfaces.

**Severity**: Medium

**Implementation recommendations**

1. Raise the minimum mobile text size for actionable or informative text to roughly 14px equivalent where feasible.
2. Reserve sub-12px styles only for non-essential decoration.
3. Test at 200% text zoom and iOS/Android large-text settings.
4. Allow pills and nav labels to wrap or reflow when text grows.

### 7) Keyboard behavior is better than average for buttons, but incomplete for workflows

**Problem**

The app uses native `<button>`, `<input>`, and `<select>` elements in many places, which is a strength. There is also visible `:focus-visible` styling. But some advanced interactions remain incomplete: modal focus management is missing, custom tabs do not provide full keyboard patterns, calendar grid cells are clickable buttons without arrow-key navigation, and PIN keypad workflows appear pointer-first.

**Why this matters**

- A mostly keyboard-friendly app can still break down in the exact moments users need reliability most.
- Screen reader and switch users often rely on predictable keyboard movement patterns.
- Mobile accessibility tools with hardware keyboards benefit from the same support.

**Severity**: Medium

**Implementation recommendations**

1. Preserve the current `focus-visible` styling, but make it stronger on low-contrast surfaces if needed.
2. Implement roving tabindex or arrow-key support for custom tablists and calendar grids where appropriate.
3. Ensure every modal has a predictable tab order and escape path.
4. Offer a direct text PIN input alternative alongside the keypad in setup/login flows.

### 8) Screen reader support has a good baseline, but custom patterns need completion

**Problem**

There are already some good accessibility basics: primary nav has an `aria-label`, toast messages use `aria-live="polite"`, progressbars are labeled, and many buttons have accessible names. However, custom controls and grouped statuses are inconsistent: tabs do not expose the full tab/panel relationship, dialogs do not act like true modals, and several status messages are plain paragraphs without announcement behavior.

**Why this matters**

- Screen reader users need role, name, state, and relationship information to understand custom UI.
- A partially semantic app can be more confusing than a purely simple one because expectations are set but not fulfilled.

**Severity**: Medium

**Implementation recommendations**

1. Add `aria-controls` and linked tabpanel IDs for custom tab interfaces.
2. Make dialog, banner, and validation announcements intentional.
3. Review all custom interactive chips/buttons for state exposure like `aria-pressed` or `aria-selected` where relevant.
4. Run a manual pass with VoiceOver and TalkBack after the first remediation wave.

### 9) Gesture dependence is limited, but precision tapping still carries too much weight

**Problem**

The app does not appear to depend on hidden swipes or motion gestures for core tasks, which is good. Still, many high-frequency actions are concentrated into small pills, compact inline actions, and dense day cells, which effectively creates a precision-tap requirement.

**Why this matters**

- Avoiding gesture-only design is not enough if the alternative controls are too small or crowded.
- One-handed use on phones amplifies precision issues.

**Severity**: Low

**Implementation recommendations**

1. Keep explicit buttons for all important actions.
2. Increase target size and spacing for clustered controls.
3. For the calendar, ensure there is always a list-based alternative to tapping dense month cells.

## Best order to fix

1. **Modal behavior and focus management** — highest risk across keyboard, screen reader, and mobile flows; it affects multiple critical tasks.
2. **Form labels and field-level errors** — improves screen reader support, clarity, and error recovery in money, setup, and settings workflows.
3. **Tap target sizing for small controls** — fast usability win with broad impact on phones.
4. **Responsive simplification for small screens** — especially bottom nav, calendar boards, and More tabs.
5. **Typography/readability adjustments plus large-text testing** — stabilizes the UI for low vision and real-world phone use.
6. **Enhanced keyboard semantics for custom widgets** — complete the tab/grid patterns after foundational dialog and form fixes.
7. **Screen reader polish pass with VoiceOver/TalkBack** — verify the remediations and close remaining semantic gaps.

## Positive notes

- Core buttons generally use native elements and a visible focus style.
- The main button pattern and PIN keypad already meet comfortable tap sizes.
- The app uses responsive CSS extensively rather than relying on desktop-only layouts.
- Toast notifications already use a live region.
- The modal container already supports internal scrolling, which is a good base for mobile improvement.
