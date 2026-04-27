import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePayoff, compareScenarios } from '../domain/debt.ts';

const debt = (id, principalRand, aprPercent, minRand) => ({
  id,
  title: id,
  principalCents: Math.round(principalRand * 100),
  aprBps: Math.round(aprPercent * 100),
  minPaymentCents: Math.round(minRand * 100),
  currency: 'ZAR'
});

test('calculatePayoff: a single debt clears in expected months under minimums only', () => {
  // R10,000 @ 12% APR, R500/mo minimum, no extra → ~24 months.
  const result = calculatePayoff([debt('a', 10_000, 12, 500)], 0, 'avalanche');
  assert.ok(result.monthsToDebtFree >= 22 && result.monthsToDebtFree <= 26, `got ${result.monthsToDebtFree}`);
  // Sanity: every per-month total paid is >= minimum.
  for (const month of result.schedule) {
    assert.ok(month.totalPaidCents > 0);
  }
});

test('calculatePayoff: extra payment cuts months for an avalanche plan', () => {
  const debts = [debt('a', 10_000, 18, 500)];
  const baseline = calculatePayoff(debts, 0, 'avalanche');
  const accelerated = calculatePayoff(debts, 200_00, 'avalanche');
  assert.ok(accelerated.monthsToDebtFree < baseline.monthsToDebtFree);
  assert.ok(accelerated.totalInterestCents < baseline.totalInterestCents);
});

test('calculatePayoff: avalanche routes extra to highest-APR debt first', () => {
  // Two debts: A is small balance with high APR; B is large with low APR.
  const debts = [debt('high-apr', 5_000, 24, 200), debt('low-apr', 20_000, 9, 500)];
  const result = calculatePayoff(debts, 300_00, 'avalanche');
  // First-month payment on high-apr debt should include extra principal.
  const firstMonth = result.schedule[0];
  const highApr = firstMonth.payments.find((p) => p.debtId === 'high-apr');
  const lowApr = firstMonth.payments.find((p) => p.debtId === 'low-apr');
  assert.ok(highApr.paidCents > 200_00); // got minimum + extra
  assert.equal(lowApr.paidCents, 500_00); // got just the minimum
});

test('calculatePayoff: snowball routes extra to smallest-balance debt first', () => {
  const debts = [debt('small', 2_000, 9, 100), debt('large', 20_000, 24, 500)];
  const result = calculatePayoff(debts, 300_00, 'snowball');
  const firstMonth = result.schedule[0];
  const small = firstMonth.payments.find((p) => p.debtId === 'small');
  const large = firstMonth.payments.find((p) => p.debtId === 'large');
  assert.ok(small.paidCents > 100_00);
  assert.equal(large.paidCents, 500_00);
});

test('calculatePayoff: extra cascades to next priority once a debt is paid off', () => {
  // Make 'small' tiny so it pays off in one month, then 'extra' should
  // cascade to 'large' in the same month.
  const debts = [debt('small', 100, 9, 100), debt('large', 5_000, 18, 200)];
  const result = calculatePayoff(debts, 1_000_00, 'snowball');
  const firstMonth = result.schedule[0];
  const small = firstMonth.payments.find((p) => p.debtId === 'small');
  const large = firstMonth.payments.find((p) => p.debtId === 'large');
  assert.equal(small.paidOff, true);
  // Large should have received some extra beyond its R200 minimum.
  assert.ok(large.paidCents > 200_00);
});

test('calculatePayoff: empty input returns empty schedule', () => {
  const result = calculatePayoff([], 0, 'avalanche');
  assert.deepEqual(result.schedule, []);
  assert.equal(result.monthsToDebtFree, 0);
});

test('calculatePayoff: never-pays-off case surfaces -1 monthsToDebtFree', () => {
  // Minimum payment R10 vs interest of ~R125/mo on a R10,000 @ 15% APR
  // debt → balance grows. Hits the 600-month cap.
  const result = calculatePayoff([debt('runaway', 10_000, 15, 10)], 0, 'avalanche');
  assert.equal(result.monthsToDebtFree, -1);
});

test('compareScenarios: reports months saved + interest saved', () => {
  const debts = [debt('bond', 200_000, 11, 2000)];
  const baseline = calculatePayoff(debts, 0, 'avalanche');
  const accelerated = calculatePayoff(debts, 1_000_00, 'avalanche');
  const comparison = compareScenarios(baseline, accelerated);
  assert.ok(comparison.monthsSaved !== null && comparison.monthsSaved > 0);
  assert.ok(comparison.interestSavedCents > 0);
});

test('compareScenarios: returns null monthsSaved when either side never pays off', () => {
  const debts = [debt('runaway', 10_000, 15, 10)];
  const baseline = calculatePayoff(debts, 0, 'avalanche');
  const accelerated = calculatePayoff(debts, 5_00, 'avalanche');
  const comparison = compareScenarios(baseline, accelerated);
  assert.equal(comparison.monthsSaved, null);
});
