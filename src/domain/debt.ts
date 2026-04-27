// Debt payoff math (Phase 4.1 + 4.2).
//
// Pure module. Two strategies:
//   - 'avalanche': pay minimums on every debt; route the extra to the
//     highest-APR debt first. Mathematically optimal — pays the least
//     interest overall.
//   - 'snowball': pay minimums on every debt; route the extra to the
//     smallest-balance debt first. Slightly worse interest-wise, but the
//     "first debt paid off" momentum is psychologically powerful — many
//     households finish snowball plans and don't finish avalanche ones.
//
// We keep both; the family picks per-family in Settings.
//
// Returned schedule is month-by-month so the UI can render a payoff
// chart, the proposal engine can preview "this extra payment saves R X
// in interest", and the planner can subtract debt payments from
// projected cashflow.

export type DebtStrategy = 'avalanche' | 'snowball';

export type Debt = {
  id: string;
  title: string;
  /** Outstanding balance in cents. */
  principalCents: number;
  /** Annual percentage rate in basis points (e.g. 14.5% APR = 1450). */
  aprBps: number;
  /** Required monthly minimum payment in cents. */
  minPaymentCents: number;
  currency: string;
};

export type DebtMonth = {
  month: number; // 1-indexed; 1 = first month after the start date
  payments: Array<{
    debtId: string;
    interestCents: number;
    principalCents: number;
    paidCents: number;
    remainingCents: number;
    paidOff: boolean;
  }>;
  totalPaidCents: number;
  totalInterestCents: number;
  totalRemainingCents: number;
};

export type PayoffResult = {
  schedule: DebtMonth[];
  /** Total interest paid across the whole plan. */
  totalInterestCents: number;
  /** Months until every debt is cleared (0 if input is empty). */
  monthsToDebtFree: number;
};

const monthlyRate = (aprBps: number) => aprBps / 10_000 / 12;

const cloneDebt = (debt: Debt) => ({ ...debt });

const debtPriority = (a: Debt, b: Debt, strategy: DebtStrategy) => {
  if (strategy === 'avalanche') return b.aprBps - a.aprBps; // highest APR first
  return a.principalCents - b.principalCents; // smallest balance first
};

/**
 * Simulate a debt payoff plan with optional extra monthly principal applied
 * via the chosen strategy. Returns a per-month schedule plus aggregate
 * stats. Hard-capped at 600 months (50 years) so a degenerate input
 * (e.g. minimum < interest accruing) doesn't loop forever — the cap
 * surfaces in the result so the UI can warn.
 */
export const calculatePayoff = (
  debts: Debt[],
  extraMonthlyCents: number,
  strategy: DebtStrategy
): PayoffResult => {
  if (!debts.length) {
    return { schedule: [], totalInterestCents: 0, monthsToDebtFree: 0 };
  }

  const live = debts.map(cloneDebt);
  const schedule: DebtMonth[] = [];
  let totalInterestCents = 0;
  const HARD_CAP_MONTHS = 600;

  for (let month = 1; month <= HARD_CAP_MONTHS; month++) {
    if (live.every((d) => d.principalCents === 0)) break;

    const payments: DebtMonth['payments'] = [];
    let monthInterestCents = 0;
    let monthPaidCents = 0;

    // 1. Accrue interest on every debt.
    for (const debt of live) {
      if (debt.principalCents === 0) continue;
      const interestCents = Math.round(debt.principalCents * monthlyRate(debt.aprBps));
      debt.principalCents += interestCents;
      monthInterestCents += interestCents;
    }

    // 2. Pay the minimum on every debt (capped at outstanding balance).
    for (const debt of live) {
      if (debt.principalCents === 0) continue;
      const before = debt.principalCents;
      const pay = Math.min(debt.minPaymentCents, debt.principalCents);
      debt.principalCents -= pay;
      monthPaidCents += pay;
      payments.push({
        debtId: debt.id,
        interestCents: Math.round(before * monthlyRate(debt.aprBps)),
        principalCents: pay - Math.round(before * monthlyRate(debt.aprBps)),
        paidCents: pay,
        remainingCents: debt.principalCents,
        paidOff: debt.principalCents === 0
      });
    }

    // 3. Route extra cash to the priority debt (avalanche/snowball). When
    // a target debt is paid off, the remaining extra cascades to the next
    // priority. This is the snowball / avalanche compounding behaviour.
    let extraLeft = extraMonthlyCents;
    while (extraLeft > 0) {
      const target = live
        .filter((d) => d.principalCents > 0)
        .sort((a, b) => debtPriority(a, b, strategy))[0];
      if (!target) break;
      const pay = Math.min(extraLeft, target.principalCents);
      target.principalCents -= pay;
      extraLeft -= pay;
      monthPaidCents += pay;
      // Update the existing payment row for this debt.
      const row = payments.find((p) => p.debtId === target.id);
      if (row) {
        row.paidCents += pay;
        row.principalCents += pay;
        row.remainingCents = target.principalCents;
        row.paidOff = target.principalCents === 0;
      }
    }

    totalInterestCents += monthInterestCents;
    const totalRemainingCents = live.reduce((sum, d) => sum + d.principalCents, 0);
    schedule.push({
      month,
      payments,
      totalPaidCents: monthPaidCents,
      totalInterestCents: monthInterestCents,
      totalRemainingCents
    });
  }

  return {
    schedule,
    totalInterestCents,
    monthsToDebtFree:
      schedule.length === HARD_CAP_MONTHS && schedule[schedule.length - 1].totalRemainingCents > 0
        ? -1 // never paid off within the cap — UI surfaces "min payment too low"
        : schedule.length
  };
};

/**
 * Compare two payoff plans and return the human-readable savings. Used
 * by the DebtAcceleration proposal preview ("paying R300 extra a month
 * shortens this plan by 7 months and saves R12,400 in interest").
 */
export const compareScenarios = (baseline: PayoffResult, accelerated: PayoffResult) => ({
  monthsSaved:
    baseline.monthsToDebtFree === -1 || accelerated.monthsToDebtFree === -1
      ? null
      : baseline.monthsToDebtFree - accelerated.monthsToDebtFree,
  interestSavedCents: baseline.totalInterestCents - accelerated.totalInterestCents
});
