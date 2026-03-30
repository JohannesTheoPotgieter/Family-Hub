import type { PlannerLineItem } from './storage';

export const getLineItemAmount = (item: PlannerLineItem, monthIso: string): number => {
  if (!item.isActive) return 0;
  return item.monthlyOverrides[monthIso] ?? item.defaultAmountCents;
};

export type PlannerMonthSummary = {
  monthIso: string;
  openingBalance: number;
  fixedIncome: number;
  variableIncome: number;
  totalIncome: number;
  fixedExpenses: number;
  variableExpenses: number;
  totalExpenses: number;
  netCashFlow: number;
  closingBalance: number;
};

export const buildPlannerMonthSummary = (
  items: PlannerLineItem[],
  monthIso: string,
  openingBalance: number
): PlannerMonthSummary => {
  const fixedIncome = items.filter((i) => i.kind === 'income' && i.isFixed).reduce((s, i) => s + getLineItemAmount(i, monthIso), 0);
  const variableIncome = items.filter((i) => i.kind === 'income' && !i.isFixed).reduce((s, i) => s + getLineItemAmount(i, monthIso), 0);
  const fixedExpenses = items.filter((i) => i.kind === 'expense' && i.isFixed).reduce((s, i) => s + getLineItemAmount(i, monthIso), 0);
  const variableExpenses = items.filter((i) => i.kind === 'expense' && !i.isFixed).reduce((s, i) => s + getLineItemAmount(i, monthIso), 0);
  const totalIncome = fixedIncome + variableIncome;
  const totalExpenses = fixedExpenses + variableExpenses;
  const netCashFlow = totalIncome - totalExpenses;
  return {
    monthIso,
    openingBalance,
    fixedIncome,
    variableIncome,
    totalIncome,
    fixedExpenses,
    variableExpenses,
    totalExpenses,
    netCashFlow,
    closingBalance: openingBalance + netCashFlow
  };
};

export const buildRollingPlannerSummary = (
  items: PlannerLineItem[],
  openingBalance: number,
  startMonthIso: string,
  numMonths: number
): PlannerMonthSummary[] => {
  const results: PlannerMonthSummary[] = [];
  let balance = openingBalance;
  const [year, month] = startMonthIso.split('-').map(Number);
  for (let i = 0; i < numMonths; i++) {
    const date = new Date(year, month - 1 + i, 1);
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const summary = buildPlannerMonthSummary(items, iso, balance);
    results.push(summary);
    balance = summary.closingBalance;
  }
  return results;
};

export const getPlannerCategories = (items: PlannerLineItem[], kind: 'income' | 'expense'): string[] =>
  [...new Set(items.filter((i) => i.kind === kind).map((i) => i.category))].sort();
