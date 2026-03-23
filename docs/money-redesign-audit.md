# Family Hub money redesign audit

## Goal
Redesign the money area for normal people, not accountants. The experience should feel simple, visual, understandable, useful in daily life, and calm on a phone.

## Audit summary of the current experience

### What works already
- The current money area already separates the experience into overview, bills, budget, transactions, and goals, which gives a solid foundation for a broader household money workspace.
- The overview already tries to answer the right top-level questions: income, spending, bills due soon, budget status, recent activity, and savings.
- Bills are relatively understandable because they use due-date language, urgency badges, and clear actions such as mark paid, duplicate, edit, and delete.
- Budget cards are more approachable than spreadsheet rows because they already use progress bars and plain-language labels like “On track”, “Almost used”, and “Over budget”.
- The transaction import flow is powerful and useful for advanced households, but it currently lives beside the everyday transaction workflow rather than behind a clearer “advanced” boundary.

### Current information architecture
Current top-level tabs:
1. Overview
2. Bills
3. Budget
4. Transactions
5. Goals

### Current primary user flows
1. **Check if the family is okay this month**
   - Open Money.
   - Land on Overview.
   - Read the health banner, six KPI cards, budget check, cash picture, recent activity, and savings.
   - Mentally combine multiple signals to decide whether things are okay.

2. **Pay or review bills**
   - Open Bills tab.
   - Read KPI cards.
   - Use status filter pills.
   - Scan card list.
   - Mark an item paid or manage bill details.

3. **Set or change budgets**
   - Open Budget tab.
   - Read KPI cards.
   - Use the budget editor.
   - Optionally generate starter budgets.
   - Review category cards.

4. **Log spending or income**
   - Open Transactions tab.
   - Use search, category filter, and money in/out pills.
   - Open composer.
   - Save manual transaction or use advanced bank import.

5. **Check savings goals**
   - Open Goals tab.
   - Review totals and progress cards.

## Confusion points and UX risks

### 1) The overview is trying to do too much at once
The overview contains a health banner, six KPI cards, action buttons, a weekly attention section, a budget check section, a cash picture section, recent activity, and savings. This is rich, but it asks the user to process too many ideas before they can answer one simple question: **“Are we okay this month?”**

**Why this is confusing for normal people**
- Users have to reconcile several similar numbers: money left after bills, money in, money out, available cash, likely month-end, and left after this week.
- Some values overlap conceptually, but the UI does not explain the difference well enough.
- A family that just wants reassurance may feel like they are reading a finance dashboard rather than a household helper.

### 2) Similar concepts are named differently across the experience
Examples in the current UI include:
- “Money left after bills”
- “Available cash”
- “Likely month-end”
- “Left after this week”
- “Safe to spend” in code
- “Net change” in transactions

**Why this is confusing**
- These labels require financial interpretation.
- Different sections use different mental models for the same month.
- A non-financial user may not know which number they should actually trust.

### 3) Transactions are still ledger-shaped
The transactions page is cleaner than a spreadsheet, but the structure is still driven by transaction records, filters, and entry editing.

**Why this is confusing**
- The main task for most families is not “manage transactions”; it is “understand where the money went”.
- Search + category + money in/out filters are useful, but the page lacks a stronger summary layer such as grouped spending stories, merchant/category patterns, or “biggest spends this week”.
- Manual entry and advanced import sit close together even though they serve very different user mindsets.

### 4) Budgeting is still category-first rather than family-first
The budget experience explains spending progress reasonably well, but its primary action is still “add or update a category budget”.

**Why this is confusing**
- Families usually think “Can we still spend on groceries this week?” not “Edit monthly category limit”.
- There is no clear explanation of how budgets help day to day.
- The page does not clearly separate essentials versus flexible spending.

### 5) Cash flow is present but not easy to trust at a glance
The product calculates useful cash-flow information in code, but the current overview exposes it as a set of totals instead of a story.

**Why this is confusing**
- Users need a visual sequence: starting money → money in → paid already → still due → expected left.
- The current presentation requires interpretation instead of offering a plain-language forecast.
- It does not yet use a visual timeline or step-by-step forecast card that explains what is happening.

### 6) The top navigation is feature-based, not outcome-based
Overview / Bills / Budget / Transactions / Goals is logical from a system perspective.

**Why this is confusing**
- Users think in outcomes: “Am I okay?”, “What do I need to pay?”, “Where is the money going?”, “What should I slow down?”, “Can I still spend?”
- A feature-based IA can feel more like bookkeeping than family guidance.

### 7) Phone usability is decent structurally, but cognitive load is still high
The UI appears mobile-aware, but many sections stack a lot of dense cards and controls.

**Why this is confusing on phone**
- Long stacked cards increase scrolling before confidence.
- Filters and editors compete with decision-making content.
- Users may need too many taps to move from summary to action.

## Redesign principles
1. **Start with reassurance.** Answer “Are we okay this month?” within the first screenful.
2. **Use plain language.** Prefer “left to spend” over “net balance” unless the advanced mode is enabled.
3. **Show the story of money.** Use visual flows instead of isolated totals.
4. **Group by everyday decisions.** Bills due, spending trends, category pressure, and expected month-end should be obvious.
5. **Progressive disclosure.** Keep advanced import, line-item editing, and detailed history available but secondary.
6. **Phone first.** One-thumb actions, clear section hierarchy, short labels, and scannable cards.

## Proposed information architecture for the money section

### Recommended top-level IA
1. **Home**
   - Household money status for the month
   - “Are we okay?” answer
   - Upcoming due items
   - Spending trend snapshot
   - Quick actions

2. **Bills & due dates**
   - Due today
   - Due this week
   - Later this month
   - Recently paid
   - Add / edit bill

3. **Spending**
   - Where money is going
   - Transactions simplified into grouped, human-readable sections
   - Category trends
   - Search and line-item history

4. **Plan**
   - Budgeting rewritten as plan vs actual
   - Essential categories first
   - Flexible categories second
   - Suggested adjustments

5. **Goals**
   - Savings progress
   - Family goals

### Optional advanced mode IA
When advanced mode is enabled, add a secondary utility rail or section for:
- Statement import
- Full transaction ledger
- Category editing
- Recurring bill templates
- Debug-style cash-flow detail

This keeps everyday use calm while still supporting power users.

## Page-level redesign recommendations

### 1) Money Home (replaces current Overview emphasis)
**Primary purpose:** answer the top four household questions in one screen:
- What money came in?
- What went out?
- What is due soon?
- Are we okay this month?

**Recommended structure**
1. **Top status card: “This month looks okay” / “This month needs attention”**
   - Large human sentence.
   - One supporting reason.
   - Traffic-light color treatment.
   - One primary action.

2. **Money flow strip**
   - Starting balance
   - Income in
   - Spending out
   - Bills still due
   - Expected left
   - Use a horizontal stepper or stacked visual bar.

3. **Due soon carousel/list**
   - Today
   - Next 7 days
   - Overdue first
   - Amount + date + one-tap action

4. **Spending trend card**
   - Top 3 categories this month
   - Up/down vs last month
   - Example: “Groceries are up 12% from last month.”

5. **Budget clarity card**
   - Translate category budgets into plain language.
   - Example: “Groceries: still comfortable”, “Transport: nearly used”, “Eating out: over plan”.

6. **Recent activity summary**
   - Show 3 to 5 most relevant items, not a full ledger.
   - Include “See all spending” link.

### 2) Bills & due dates
**Primary purpose:** reduce missed payments and anxiety.

**Recommended structure**
- Section tabs/chips inside the page: Overdue, This week, Later, Paid.
- Lead card showing total due in the next 7 days.
- Bill cards with larger due-date treatment than category treatment.
- “Mark paid” remains the dominant action.
- Recurring bills grouped under a clearer label like “Repeats every month”.

**Simplifications**
- Move duplicate/edit/delete into a secondary overflow menu on phone.
- Use plain status copy:
  - “Overdue”
  - “Due today”
  - “Due in 3 days”
  - “Paid”
- Keep notes collapsed unless present and useful.

### 3) Spending
**Primary purpose:** explain where money went, not just store transaction rows.

**Recommended structure**
1. **Summary header**
   - Total spent this month
   - Total income this month
   - Biggest category
   - Biggest recent spend

2. **Category story cards**
   - Groceries, Transport, Utilities, etc.
   - Each card shows total, trend vs last month, and 2–3 recent examples.

3. **Transaction list as secondary layer**
   - Group by date with human-friendly headers like “Today”, “Yesterday”, “Earlier this week”.
   - Show merchant/title, category pill, and amount.
   - Hide source labels like “statement import” by default; show them only in details.

4. **Capture actions**
   - Primary: Add spending / Add income.
   - Secondary: Import bank file (advanced).

### 4) Plan (budgeting clarity)
**Primary purpose:** help a family steer the month without feeling judged.

**Recommended structure**
- Rename “Budget” to **Plan**.
- Lead with a plain-language summary such as:
  - “You planned R12,000 and have used R8,700 so far.”
  - “Three categories need attention.”
- Split categories into:
  - **Essentials**: groceries, utilities, school, transport, health
  - **Flexible**: entertainment, eating out, shopping, other
- Show category cards sorted by urgency, not alphabetically.
- Offer suggestion text:
  - “Groceries look normal for this point in the month.”
  - “Entertainment is running ahead of plan.”

**Key improvement**
Do not make the first thing on the page a form. Make the first thing an explanation, and place editing below it.

### 5) Cash-flow readability
**Primary purpose:** help users trust the forecast.

**Recommended structure**
- Add a dedicated **This month forecast** card.
- Use a visual equation or stacked bar:
  - Start with: opening balance
  - Add: money in
  - Subtract: recorded spending
  - Subtract: bills still due
  - End with: expected left at month end
- Add one plain-language sentence beneath it:
  - “If nothing unusual changes, you should finish the month with about R2,400 left.”
- If negative, switch to:
  - “At the current pace, the month may end short by about R900.”

### 6) Goals
**Primary purpose:** motivation, not administration.

**Recommended structure**
- Keep current progress visuals.
- Bring goals into Home as a smaller motivational card when relevant.
- Keep the full Goals page simple and celebratory.

## Component list for the redesigned experience

### New or reworked components
1. **MoneyStatusHero**
   - Big monthly status sentence
   - Supporting explanation
   - Primary action button

2. **MoneyFlowStrip**
   - Visual cash-flow sequence
   - Start → in → out → due → expected left

3. **DueSoonStack**
   - Priority-ordered list of overdue and upcoming bills
   - Swipe-friendly on phone

4. **TrendCategoryCard**
   - Category total
   - Trend up/down vs prior month
   - Plain-language explanation

5. **BudgetHealthCard**
   - Reworked budget card with “comfortable / watch / over” language
   - Optional progress bar

6. **SpendingStoryList**
   - Grouped recent spending items by date or category
   - Human-readable headers

7. **QuickCaptureBar**
   - Sticky mobile action row
   - Add spending, add income, mark paid

8. **AdvancedToolsDrawer**
   - Houses statement import and detailed ledger controls
   - Hidden by default

9. **MonthlyForecastCard**
   - Visual forecast of likely month-end position
   - Includes one plain-language summary sentence

10. **CategoryPressureList**
   - Sorts categories by urgency
   - Helps families see what needs attention first

## Implementation plan

### Phase 1: Clarify the structure without changing the whole data model
- Rename user-facing labels to plain language.
- Rework the overview into a simpler Money Home page.
- Reduce the first-screen KPI count.
- Add a clearer cash-flow visual summary.
- Reposition advanced import as secondary.

### Phase 2: Simplify spending and planning experiences
- Rename “Budget” to “Plan”.
- Add category trend comparisons versus previous month.
- Reorder budget/spending cards by urgency.
- Group transaction history by date and category story.

### Phase 3: Improve mobile usability
- Add sticky quick actions.
- Collapse secondary actions into overflow menus.
- Increase touch target clarity for bill and transaction cards.
- Keep critical monthly status and due-soon information within the first screenful.

### Phase 4: Introduce advanced mode
- Add a per-user or per-household toggle.
- Move imports, detailed ledger metadata, and finance-heavy labels there.
- Keep the default mode family-friendly.

## Optional advanced mode ideas for power users
- Full transaction ledger with source, import batch, and notes metadata
- Statement import center with review history
- Monthly category trend charts with 3–6 month comparisons
- Recurring bill template manager
- Export / audit tools
- Balance reconciliation helpers
- Category rule suggestions for imported transactions

## Specific recommendations mapped to the original task list

### 1. Audit current money views and flows
Completed in this document through the current IA, user flows, and page-by-page assessment.

### 2. Identify confusion points
Key confusion points are:
- too many summary numbers
- inconsistent naming for similar concepts
- feature-first navigation
- transaction-first instead of understanding-first spending view
- budgeting that starts with forms instead of guidance
- cash flow shown as totals rather than a story

### 3. Redesign the overview experience
Convert Overview into **Money Home** with:
- one strong monthly status card
- one money flow strip
- one due-soon section
- one spending trend section
- one budget health section

### 4. Simplify transaction/category presentation
- Make spending categories the primary story layer
- Push raw ledger details below the fold or into advanced mode
- Group transactions by date and show cleaner summaries

### 5. Improve budgeting clarity
- Rename Budget to Plan
- Separate essentials from flexible categories
- Replace “budget management” tone with “how you’re tracking” tone

### 6. Improve cash-flow readability
- Add a visual monthly forecast component
- Explain expected month-end in a single sentence
- Standardize labels around one trusted forecast number

### 7. Add visual explanations where needed
Recommended visuals:
- money flow strip
- category trend arrows
- urgency-ordered due list
- budget health progress cards
- forecast card with positive/negative state

### 8. Ensure phone usability is excellent
- Reduce card density above the fold
- Make actions sticky and thumb-friendly
- Move secondary actions into overflow
- Keep filters short and outcome-focused

## Final product direction
The current money area has good ingredients, but it still feels closer to a lightweight bookkeeping tool than a family money guide. The redesign should preserve the existing bill, budget, transaction, and import capabilities while changing the experience to lead with confidence, explanation, and everyday decisions.

The core litmus test for the redesign is simple:
**A tired parent opening the app on their phone should understand the household money situation in under 10 seconds.**
