import { getTodayIso } from './date';
import type { Bill, Budget, MoneyState, MoneyTransaction } from './storage';

export const DEFAULT_MONEY_CATEGORIES = ['Groceries', 'Utilities', 'Transport', 'School', 'Entertainment', 'Health', 'Other'];

export type CashflowEntry = {
  id: string;
  title: string;
  dateIso: string;
  amountCents: number;
  kind: 'inflow' | 'outflow';
  category: string;
  source: 'transaction' | 'bill';
  status: 'recorded' | 'scheduled';
  runningBalanceCents: number;
};

export type CashflowPlan = {
  openingBalanceCents: number;
  projectedClosingBalanceCents: number;
  recordedIncomeCents: number;
  recordedOutflowCents: number;
  scheduledBillOutflowCents: number;
  entries: CashflowEntry[];
};

export const formatCurrencyZAR = (amountCents: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 2 }).format((Number.isFinite(amountCents) ? amountCents : 0) / 100);

export const formatMonthLabel = (yyyyMm: string) => {
  const [year, month] = yyyyMm.split('-').map(Number);
  return new Intl.DateTimeFormat('en-ZA', { month: 'long', year: 'numeric' }).format(new Date(year, (month || 1) - 1, 1));
};

export const formatDueDateFriendly = (iso: string) => new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));

export const formatRelativeDueStatus = (iso: string, paid: boolean) => {
  if (paid) return 'Paid';
  const today = getTodayIso();
  if (iso < today) return 'Overdue';
  const diffDays = Math.ceil((new Date(iso).getTime() - new Date(today).getTime()) / 86_400_000);
  if (diffDays <= 0) return 'Due today';
  if (diffDays <= 7) return `Due in ${diffDays} day${diffDays === 1 ? '' : 's'}`;
  return 'Upcoming';
};

export const getMonthIso = (dateIso: string) => dateIso.slice(0, 7);

export const getMonthBills = (state: MoneyState, monthIsoYYYYMM: string) => state.bills.filter((bill) => bill.dueDateIso.slice(0, 7) === monthIsoYYYYMM);

export const getDueSoonBills = (bills: Bill[], todayIso = getTodayIso(), days = 7) => {
  const endDate = new Date(todayIso);
  endDate.setDate(endDate.getDate() + days);
  const endIso = endDate.toISOString().slice(0, 10);
  return bills.filter((bill) => !bill.paid && bill.dueDateIso >= todayIso && bill.dueDateIso <= endIso);
};

export const getOverdueBills = (bills: Bill[], todayIso = getTodayIso()) => bills.filter((bill) => !bill.paid && bill.dueDateIso < todayIso);

export const getMonthTransactions = (state: MoneyState, monthIsoYYYYMM: string) => state.transactions.filter((tx) => tx.dateIso.slice(0, 7) === monthIsoYYYYMM);

export const getMonthIncomeTotal = (state: MoneyState, monthIsoYYYYMM: string) => getMonthTransactions(state, monthIsoYYYYMM).filter((tx) => tx.kind === 'inflow').reduce((sum, tx) => sum + tx.amountCents, 0);

export const getMonthSpendingTotal = (state: MoneyState, monthIsoYYYYMM: string) => getMonthTransactions(state, monthIsoYYYYMM).filter((tx) => tx.kind === 'outflow').reduce((sum, tx) => sum + tx.amountCents, 0);

export const getNetBalance = (state: MoneyState, monthIsoYYYYMM: string) => getMonthIncomeTotal(state, monthIsoYYYYMM) - getMonthSpendingTotal(state, monthIsoYYYYMM);

export const getBudgetStatus = (state: MoneyState, monthIsoYYYYMM: string) => {
  const monthBudgets = state.budgets.filter((budget) => budget.monthIsoYYYYMM === monthIsoYYYYMM);
  const spentByCategory = getMonthTransactions(state, monthIsoYYYYMM).reduce<Record<string, number>>((acc, tx) => {
    if (tx.kind === 'outflow') acc[tx.category] = (acc[tx.category] ?? 0) + tx.amountCents;
    return acc;
  }, {});
  const totalLimit = monthBudgets.reduce((sum, budget) => sum + budget.limitCents, 0);
  const totalSpent = monthBudgets.reduce((sum, budget) => sum + (spentByCategory[budget.category] ?? 0), 0);
  return {
    totalLimitCents: totalLimit,
    totalSpentCents: totalSpent,
    remainingCents: totalLimit - totalSpent,
    overBudgetCount: monthBudgets.filter((budget) => (spentByCategory[budget.category] ?? 0) > budget.limitCents).length
  };
};

export const getOpeningBalanceCents = (state: MoneyState, monthIsoYYYYMM: string) => {
  const monthStartIso = `${monthIsoYYYYMM}-01`;
  return state.transactions.reduce((sum, tx) => {
    if (tx.dateIso >= monthStartIso) return sum;
    return sum + (tx.kind === 'inflow' ? tx.amountCents : -tx.amountCents);
  }, 0);
};

export const getCashflowPlan = (state: MoneyState, monthIsoYYYYMM: string): CashflowPlan => {
  const openingBalanceCents = getOpeningBalanceCents(state, monthIsoYYYYMM);
  const monthTransactions = getMonthTransactions(state, monthIsoYYYYMM);
  const monthBills = getMonthBills(state, monthIsoYYYYMM);

  const transactionEntries = monthTransactions.map((tx) => ({
    id: `tx-${tx.id}`,
    title: tx.title,
    dateIso: tx.dateIso,
    amountCents: tx.kind === 'inflow' ? tx.amountCents : -tx.amountCents,
    kind: tx.kind,
    category: tx.category,
    source: 'transaction' as const,
    status: 'recorded' as const
  }));

  const billEntries = monthBills
    .filter((bill) => !bill.linkedTransactionId)
    .map((bill) => ({
      id: `bill-${bill.id}`,
      title: bill.title,
      dateIso: bill.paidDateIso ?? bill.dueDateIso,
      amountCents: -bill.amountCents,
      kind: 'outflow' as const,
      category: bill.category,
      source: 'bill' as const,
      status: bill.paid ? 'recorded' as const : 'scheduled' as const
    }));

  const sortedEntries = [...transactionEntries, ...billEntries].sort((a, b) => {
    if (a.dateIso !== b.dateIso) return a.dateIso.localeCompare(b.dateIso);
    if (a.status !== b.status) return a.status === 'recorded' ? -1 : 1;
    return a.title.localeCompare(b.title);
  });

  let runningBalanceCents = openingBalanceCents;
  const entries = sortedEntries.map((entry) => {
    runningBalanceCents += entry.amountCents;
    return { ...entry, runningBalanceCents };
  });

  return {
    openingBalanceCents,
    projectedClosingBalanceCents: runningBalanceCents,
    recordedIncomeCents: transactionEntries.filter((entry) => entry.kind === 'inflow').reduce((sum, entry) => sum + entry.amountCents, 0),
    recordedOutflowCents: [...transactionEntries, ...billEntries.filter((entry) => entry.status === 'recorded')]
      .filter((entry) => entry.kind === 'outflow')
      .reduce((sum, entry) => sum + Math.abs(entry.amountCents), 0),
    scheduledBillOutflowCents: billEntries
      .filter((entry) => entry.status === 'scheduled')
      .reduce((sum, entry) => sum + Math.abs(entry.amountCents), 0),
    entries
  };
};

export const getTopSpendingCategory = (state: MoneyState, monthIsoYYYYMM: string) => {
  const grouped = getMonthTransactions(state, monthIsoYYYYMM).reduce<Record<string, number>>((acc, tx) => {
    if (tx.kind === 'outflow') acc[tx.category] = (acc[tx.category] ?? 0) + tx.amountCents;
    return acc;
  }, {});
  return Object.entries(grouped).sort((a, b) => b[1] - a[1])[0] ?? null;
};

export const getRecentMoneyActivity = (state: MoneyState) => {
  const paidBills = state.bills
    .filter((bill) => bill.paid && bill.paidDateIso)
    .map((bill) => ({ id: `bill-${bill.id}`, dateIso: bill.paidDateIso as string, title: `${bill.title} paid`, amountCents: bill.amountCents, type: 'bill' as const }));
  const importedTransactions = state.transactions
    .filter((tx) => tx.source !== 'bill')
    .map((tx) => ({ id: `tx-${tx.id}`, dateIso: tx.dateIso, title: tx.title, amountCents: tx.kind === 'outflow' ? -tx.amountCents : tx.amountCents, type: 'transaction' as const }));
  return [...paidBills, ...importedTransactions].sort((a, b) => b.dateIso.localeCompare(a.dateIso)).slice(0, 5);
};

export const markBillPaidWithOptionalTransaction = (
  state: MoneyState,
  billId: string,
  proofFileName: string,
  paidDateIso = getTodayIso()
): MoneyState => {
  const bill = state.bills.find((item) => item.id === billId);
  if (!bill) return state;
  let nextTransactions = state.transactions;
  let linkedTransactionId = bill.linkedTransactionId;
  if (bill.autoCreateTransaction && !bill.linkedTransactionId) {
    const newTransaction: MoneyTransaction = {
      id: `tx-${Date.now()}`,
      title: bill.title,
      amountCents: bill.amountCents,
      dateIso: paidDateIso,
      kind: 'outflow',
      category: bill.category,
      notes: bill.notes,
      source: 'bill',
      sourceBillId: bill.id
    };
    nextTransactions = [newTransaction, ...state.transactions];
    linkedTransactionId = newTransaction.id;
  }
  return {
    ...state,
    bills: state.bills.map((item) =>
      item.id === billId
        ? { ...item, paid: true, paidDateIso, proofFileName, linkedTransactionId }
        : item
    ),
    transactions: nextTransactions
  };
};

export const toCents = (value: number) => Math.round(value * 100);
export const fromCents = (amountCents: number) => amountCents / 100;

export const getActiveMonth = (state: MoneyState) => {
  const dates = [
    ...state.transactions.map((tx) => tx.dateIso),
    ...state.bills.map((bill) => bill.dueDateIso),
    getTodayIso()
  ];
  const sorted = dates.sort();
  return (sorted[sorted.length - 1]?.slice(0, 7)) ?? getTodayIso().slice(0, 7);
};

export const createDefaultBudgetsForMonth = (monthIsoYYYYMM: string): Budget[] =>
  DEFAULT_MONEY_CATEGORIES.map((category) => ({ id: `budget-${category}-${monthIsoYYYYMM}`, monthIsoYYYYMM, category, limitCents: 0 }));
