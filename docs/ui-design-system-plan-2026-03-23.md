# Family Hub UI Design System Plan

_Date: 2026-03-23_

## Vision

Family Hub should feel like a calm, modern family dashboard: polished enough for adults, warm enough for children, and structured enough that busy households can scan it quickly. The visual language should feel **soft, bright, and trustworthy** rather than playful-chaotic. The goal is to keep the experience approachable without drifting into cartoon UI.

## Core principles

1. **Mobile-first by default**: every component should feel designed for a phone before it expands to tablet or desktop.
2. **Warm clarity over decorative glass**: keep softness and glow, but reduce visual noise when readability or task completion suffers.
3. **Strong contrast**: body text, form labels, and status colors should meet accessible contrast expectations against light and dark surfaces.
4. **Consistent rhythm**: spacing, corner radii, shadows, and component heights should come from shared tokens.
5. **Family-safe tone**: friendly microcopy, calm color choices, and obvious actions for both adults and kids.
6. **Incremental adoption**: introduce primitives and variants first, then migrate screens in priority order.

---

## 1) Typography hierarchy

### Recommendation

Use one sans-serif family for the whole product.

- **Primary font**: Inter
- **Fallbacks**: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
- **Weights**: 500, 600, 700 only for most UI
- **Line-height rule**:
  - display/headline: 1.1-1.2
  - section titles: 1.25
  - body and labels: 1.4-1.5

### Type scale proposal

| Token | Mobile size | Weight | Usage |
|---|---:|---:|---|
| `--font-display` | 32px | 700 | login title, key hero moments |
| `--font-h1` | 28px | 700 | screen titles |
| `--font-h2` | 24px | 700 | major card headings |
| `--font-h3` | 20px | 600 | section headers |
| `--font-title` | 18px | 600 | card titles |
| `--font-body-lg` | 16px | 500 | prominent descriptions |
| `--font-body` | 15px | 500 | default body copy |
| `--font-label` | 14px | 600 | input labels, tabs, chips |
| `--font-caption` | 12px | 600 | helper text, eyebrow labels |
| `--font-micro` | 11px | 600 | status metadata only |

### Hierarchy rules

- Limit each screen to **one dominant headline**.
- Use uppercase only for eyebrow labels and tiny overlines.
- Default body size should be **15px or 16px**, not smaller.
- Use muted text only for supporting information, never as the only instructional copy.

---

## 2) Spacing system

### Recommendation

Adopt a **4px base** with a limited working set so spacing feels intentional.

### Tokens

- `--space-1: 4px`
- `--space-2: 8px`
- `--space-3: 12px`
- `--space-4: 16px`
- `--space-5: 20px`
- `--space-6: 24px`
- `--space-8: 32px`
- `--space-10: 40px`
- `--space-12: 48px`

### Rhythm rules

- Screen horizontal padding: **16px mobile**, **20px large mobile**, **24px tablet+**
- Card padding: **16px default**, **20px feature card**, **24px hero card**
- Vertical gap between stacked sections: **16px default**, **24px between major groups**
- Form field gap: **12px**
- Inline icon/text gap: **8px**
- Button group gap: **12px**

### Implementation note

Avoid adding one-off values like 14px, 18px, 22px, or 26px unless they become named tokens. Those values are often what make screens feel slightly inconsistent.

---

## 3) Card system

### Goal

Cards should be the main structural unit of the app, with only a few clearly named tiers.

### Card tiers

1. **Surface Card / `card-default`**
   - Primary container for lists, forms, summaries
   - Soft background, subtle border, medium radius, small shadow
2. **Feature Card / `card-feature`**
   - Used for home summaries, highlighted money state, setup steps
   - Slightly stronger background tint and larger padding
3. **Hero Card / `card-hero`**
   - One per screen max
   - Used for top-of-screen focus content only
4. **Subtle Card / `card-subtle`**
   - Empty states, helper panels, secondary contextual info
   - Lower elevation, stronger border, quieter fill

### Card rules

- Use **one shared radius family** across all cards.
- Reserve glassmorphism for hero moments and overlays; default cards should prioritize legibility.
- Keep card interiors structured with: `eyebrow > title > body > actions/meta`.
- Avoid multiple competing gradients inside the same card.

### Recommended tokens

- `--radius-card-sm: 16px`
- `--radius-card-md: 20px`
- `--radius-card-lg: 24px`
- `--shadow-card-1`
- `--shadow-card-2`
- `--border-card`
- `--surface-card`
- `--surface-card-feature`
- `--surface-card-hero`

---

## 4) Button system

### Button variants

1. **Primary**: main call to action on a view
2. **Secondary**: important but not dominant
3. **Tertiary / Ghost**: low-emphasis action
4. **Destructive**: dangerous actions only
5. **Icon button**: compact utility action with visible label nearby or strong aria-label

### Sizes

| Size | Height | Horizontal padding | Use |
|---|---:|---:|---|
| `sm` | 40px | 12px | inline filters only |
| `md` | 48px | 16px | default mobile button |
| `lg` | 56px | 20px | hero CTA |

### Interaction rules

- Minimum tap target: **44x44px**, preferably **48px height**.
- Use one primary button per card or section when possible.
- Secondary and tertiary buttons should share the same shape and typography.
- Destructive buttons should be solid only inside confirmation dialogs; elsewhere use outlined/destructive-ghost.

### Visual direction

- Primary buttons: solid brand fill, strong text contrast, soft shadow
- Secondary buttons: tinted background, visible border
- Ghost buttons: transparent or low-fill with stable focus ring
- Disabled buttons: lower contrast but still readable; never appear broken

---

## 5) Icon style

### Recommendation

Use a **rounded, simple outline icon set** with a consistent stroke weight. Avoid mixing emoji, outline icons, filled icons, and custom illustrated symbols in the same interaction pattern.

### Rules

- Prefer 20px or 24px icons in most controls.
- Keep stroke width visually consistent across navigation and cards.
- Use emoji only for intentionally playful areas, such as avatar/companion content or celebratory moments.
- Pair icons with text in navigation and high-value actions.
- Do not rely on icon color alone to communicate meaning.

### Suggested approach

- Use icons for navigation, actions, status context, and empty states.
- Keep emoji for family warmth in specific zones: onboarding, rewards, pet/avatar scenes, success celebration.

---

## 6) Form styling

### Goals

Forms should feel calm, obvious, and forgiving on mobile.

### Field pattern

- Label above field
- Optional helper text below label
- Input height: **48px min**
- Textarea min height: **104px**
- Selects and date fields should match input styling
- Validation message directly below field

### Visual treatment

- Solid or near-solid surface for fields, not translucent enough to reduce readability
- 1px border default, 2px visual emphasis on focus via border/focus ring
- Strong placeholder contrast, but still weaker than entered text
- Use section grouping for long forms rather than giant open canvases

### Validation

- Inline errors should use icon + text + color
- Success states should be subtle and not compete with actual actions
- Required state should be indicated in labels, not only in validation after failure

---

## 7) Color usage principles

### Palette structure

Use a **small semantic system** instead of many unrelated tints.

#### Foundation colors
- **Neutral background**: cool off-white / mist
- **Primary brand**: soft sapphire or cornflower blue
- **Warm accent**: peach, apricot, or sunlit gold used sparingly
- **Success**: leafy green
- **Warning**: amber
- **Danger**: berry red
- **Info**: sky blue

### Usage rules

- Blue should remain the anchor brand color.
- Warm colors should create warmth, not dominate layouts.
- One accent color per surface family is enough.
- Text should mostly sit on neutralized surfaces, not directly on gradients.
- Status colors should be used through semantic tokens, not arbitrary hex values in components.

### Contrast rules

- All text on colored surfaces should be tested for strong contrast.
- Pale backgrounds should carry darker text than the current soft-muted pattern.
- Avoid using low-opacity white over complex gradients for key content.

---

## 8) Status tags

### Pattern

Status tags should be compact, semantic, and easily scannable.

### Tag variants

- `info`
- `success`
- `warning`
- `danger`
- `neutral`
- domain-specific aliases like `task`, `payment`, `event` should map to these semantic variants

### Structure

- Optional dot/icon
- 12-14px label text
- 24-28px height
- Pill or soft-rounded rectangle

### Rules

- Status tags are for state, not actions.
- Avoid too many bespoke tag colors by feature area.
- Provide one shared component with semantic variants.

---

## 9) Empty states

### Goal

Empty states should help families understand what to do next without feeling like an error.

### Structure

1. Calm illustration or icon
2. Short title
3. One sentence explaining the benefit of taking action
4. One primary CTA
5. Optional secondary link

### Tone

- Friendly and encouraging
- Not cutesy
- Example style: “No upcoming plans yet. Add your first event so everyone can see the week ahead.”

### Reuse strategy

Create one reusable `EmptyState` component with slots for icon, title, description, primary action, and optional secondary action.

---

## 10) Loading / skeleton states

### Goal

Replace abrupt empty flashes with lightweight placeholders.

### Pattern

- Use skeleton cards that mirror the final layout.
- Show 2-4 placeholder rows rather than full-screen shimmer overload.
- Keep animation subtle and low-contrast.
- Loading indicators should preserve card height to prevent layout jumps.

### Rules

- For lists: skeleton row + title line + metadata line
- For hero cards: one title bar, one body bar group, one CTA block
- For forms: keep labels static where possible and only skeletonize values

---

## 11) Modal and drawer patterns

### Modal use cases

Use **modals** for short confirmations, lightweight data entry, and focused interruptions.

### Drawer use cases

Use **bottom drawers/sheets** for mobile-first detail panels, filters, and action menus.

### Modal rules

- Max width constrained but mobile-friendly
- Clear title, body, and action footer
- Destructive actions separated from default actions
- Tapping backdrop should close only non-destructive flows

### Drawer rules

- Bottom sheet with drag handle visual affordance
- Snap heights: content-fit, half, full
- Primary close action in header
- Preserve context behind the drawer when the task is non-destructive

### Recommendation

Move detail-heavy mobile interactions from centered desktop-style modals toward bottom sheets first.

---

## 12) Mobile navigation patterns

### Primary pattern

Keep a **persistent bottom navigation** for the 4-5 highest-value destinations.

### Navigation rules

- Use icon + text labels
- Minimum item height 56px
- Clearly active state with fill/background and not just color shift
- Keep labels short and stable

### Secondary navigation

- Use segmented controls or chips inside screens
- Avoid deeply nested tabs within cards
- Move overflow destinations into a More screen or drawer

### Recommended information architecture pattern

- Home
- Calendar
- Tasks
- Money
- More

### Mobile behavior

- Bottom nav persists across main screens
- Screen-level contextual actions live in header or floating action region, not inside nav
- For child-friendly use, preserve predictable placement and wording

---

## Design tokens proposal

```css
:root {
  --font-family-sans: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;

  --font-display: 700 32px/1.1 var(--font-family-sans);
  --font-h1: 700 28px/1.15 var(--font-family-sans);
  --font-h2: 700 24px/1.2 var(--font-family-sans);
  --font-h3: 600 20px/1.25 var(--font-family-sans);
  --font-title: 600 18px/1.3 var(--font-family-sans);
  --font-body-lg: 500 16px/1.45 var(--font-family-sans);
  --font-body: 500 15px/1.5 var(--font-family-sans);
  --font-label: 600 14px/1.4 var(--font-family-sans);
  --font-caption: 600 12px/1.35 var(--font-family-sans);

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;

  --radius-xs: 12px;
  --radius-sm: 16px;
  --radius-md: 20px;
  --radius-lg: 24px;
  --radius-pill: 999px;

  --color-bg: #f5f7fb;
  --color-surface: #ffffff;
  --color-surface-subtle: #f7f9fc;
  --color-surface-raised: #fcfdff;
  --color-border: #d8e1ee;
  --color-border-strong: #bac8dd;

  --color-text: #16233f;
  --color-text-muted: #55657f;
  --color-text-soft: #6b7c98;
  --color-primary: #4d72e6;
  --color-primary-strong: #3658c9;
  --color-primary-soft: #eaf0ff;
  --color-accent-warm: #f2c27b;
  --color-accent-peach: #f5b59e;

  --color-success: #2f8f63;
  --color-success-soft: #e6f5ed;
  --color-warning: #a96d14;
  --color-warning-soft: #fff1d9;
  --color-danger: #b44862;
  --color-danger-soft: #fde8ee;
  --color-info: #2d7eb7;
  --color-info-soft: #e7f3fb;

  --shadow-1: 0 6px 18px rgba(22, 35, 63, 0.08);
  --shadow-2: 0 14px 32px rgba(22, 35, 63, 0.12);
  --shadow-focus: 0 0 0 4px rgba(77, 114, 230, 0.2);

  --control-height-sm: 40px;
  --control-height-md: 48px;
  --control-height-lg: 56px;
  --tap-min: 44px;
}
```

### Token adoption strategy

1. Keep the existing theme file as the token source.
2. Add alias tokens first rather than rewriting every class.
3. Migrate components to semantic tokens feature by feature.
4. Remove duplicated legacy values only after components are migrated.

---

## Component inventory

### Foundations

- Typography tokens and text utility classes
- Spacing tokens and stack/cluster utilities
- Color semantic tokens
- Radius and elevation tokens
- Focus ring token

### Primitives

- `Button`
- `IconButton`
- `Card`
- `Tag`
- `Chip`
- `Input`
- `Select`
- `Textarea`
- `Field`
- `Divider`
- `Avatar`
- `EmptyState`
- `SkeletonBlock`
- `Modal`
- `BottomSheet`

### Navigation

- `BottomNav`
- `TopBar`
- `SegmentedControl`
- `TabChip`

### Screen building blocks

- `ScreenHeader`
- `SectionHeader`
- `MetricCard`
- `ListRow`
- `ActionRow`
- `StatusTag`
- `InfoBanner`
- `ConfirmationDialog`

### Domain-level composed components

- Home hero card
- Money summary card
- Bill status badge
- Task filter bar
- Calendar event chip
- Profile selector tile
- PIN pad key

---

## Before / after recommendations

### 1. Background treatment
- **Before**: multiple gradients, orbs, blur, glass, and tinted surfaces appear together.
- **After**: one calm page background, one hero treatment per screen, mostly solid readable cards.

### 2. Text hierarchy
- **Before**: several sizes are visually close, muted text carries important information, and headings vary by screen.
- **After**: one shared headline scale, default body text at 15-16px, muted text only for supporting copy.

### 3. Cards
- **Before**: most surfaces use the same glass panel style, making importance harder to scan.
- **After**: 3-4 named card types with clear purpose and elevation differences.

### 4. Buttons and chips
- **Before**: buttons, chips, pills, and nav items feel related but not fully unified.
- **After**: a shared control system with standardized heights, radii, and semantic variants.

### 5. Status communication
- **Before**: tags and badges appear in multiple one-off color treatments.
- **After**: one semantic status-tag component used across calendar, tasks, money, and places.

### 6. Overlays
- **Before**: modal pattern is present, but mobile-first drawer behavior is not standardized.
- **After**: confirmations use dialogs; filters/details use bottom sheets.

### 7. Empty/loading states
- **Before**: some areas have custom empty cards and some have skeletons, but patterns are not unified.
- **After**: one empty state component and one skeleton family reused everywhere.

---

## Priority order for implementation

### Phase 1 — Foundations
1. Normalize typography tokens and text utility usage.
2. Normalize spacing tokens and stack/container spacing.
3. Create semantic surface, border, and status tokens.
4. Standardize focus ring, control heights, and tap targets.

### Phase 2 — Core primitives
5. Refactor `Button` into primary/secondary/ghost/destructive plus sizes.
6. Refactor `Card` into named variants.
7. Add shared `Tag`, `Field`, `EmptyState`, and `Skeleton` primitives.
8. Standardize icon usage rules and selected icon library.

### Phase 3 — Navigation and overlays
9. Unify bottom navigation states and spacing.
10. Upgrade modal component into shared dialog pattern.
11. Add bottom sheet/drawer component for mobile-first flows.

### Phase 4 — High-impact screen migrations
12. Home screen hero and metric cards.
13. Login/profile selection and PIN flow.
14. Money cards, badges, and empty states.
15. Calendar chips, day cells, and modal/drawer details.
16. Task filters, task rows, and form controls.

### Phase 5 — Cleanup
17. Remove duplicate legacy CSS values and one-off component styling.
18. Document usage examples and migration rules.
19. Audit contrast and accessibility with each migration batch.

---

## Where the current UI likely violates consistency

These are likely problem areas to confirm during implementation review:

1. **Too many surface treatments at once**
   - The app uses global gradients, decorative orbs, glass cards, tinted panels, and additional gradients within controls. This risks reducing hierarchy clarity.

2. **Mixed shape language**
   - The codebase uses several radius sizes for panels, buttons, chips, nav items, profile chips, calendar cells, and PIN keys. Even when individually attractive, the system may feel loosely coordinated.

3. **One-off spacing values**
   - There are many custom paddings, gaps, and element heights across screens, making vertical rhythm harder to maintain consistently.

4. **Status color duplication by feature**
   - Task tags, money badges, calendar chips, and place badges appear to use separate hand-authored color rules instead of a single semantic mapping.

5. **Emoji mixed with system UI iconography**
   - Emoji are used for profiles, avatars, and some informative moments, but the overall icon style is not yet clearly segmented between playful and functional contexts.

6. **Muted text may be doing too much work**
   - Supportive text styling is heavily reused; in some cards it likely weakens the contrast of content that should remain prominent.

7. **Overlay pattern not yet mobile-standardized**
   - The existing modal is centered and card-like, but mobile flows would likely benefit from bottom sheets for filters, detail views, and action menus.

8. **Empty and loading states are partially standardized, not fully standardized**
   - The app already contains multiple custom empty states and skeleton patterns, but they are not yet organized as a single reusable system.

---

## Incremental rollout plan

### Week 1
- Finalize token names.
- Add typography, spacing, control height, and semantic color aliases.
- Create design documentation page in the repo.

### Week 2
- Refactor `Button`, `Card`, and `Tag` primitives.
- Add reusable `EmptyState` and `SkeletonBlock` components.

### Week 3
- Migrate Home and Login first because they set the visual tone.
- Validate contrast and tap target sizes on mobile.

### Week 4
- Migrate Money, Tasks, and Calendar surfaces.
- Introduce bottom sheet pattern where modal usage is currently dense.

### Ongoing
- Remove legacy utility classes only after each screen is migrated.
- Keep screenshots for before/after comparison per screen.
- Track all remaining one-off colors, radii, and spacing values as debt.

---

## Success criteria

The design system is working if:

- A new screen can be assembled mostly from existing primitives.
- Users can identify primary actions immediately on mobile.
- Adults perceive the app as polished and trustworthy.
- Kids can still understand and enjoy the interface.
- Visual warmth comes from restraint and consistency, not decoration overload.
- Accessibility improves as the system becomes more beautiful, not less.
