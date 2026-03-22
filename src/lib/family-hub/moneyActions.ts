import { toCents, findBudgetForMonthCategory } from './money';
import type { Bill, Budget, MoneyTransaction } from './storage';

export const createEmptyBillDraft = () => ({ title: '', amount: '', dueDateIso: new Date().toISOString().slice(0, 10), category: 'Utilities', notes: '', autoCreateTransaction: true, recurrence: 'none' as 'none' | 'monthly' });
export const createEmptyTransactionDraft = (): { title: string; amount: string; dateIso: string; kind: 'inflow' | 'outflow'; category: string; notes: string } => ({ title: '', amount: '', dateIso: new Date().toISOString().slice(0, 10), kind: 'outflow', category: 'Other', notes: '' });

export const buildBillPayload = (draft: ReturnType<typeof createEmptyBillDraft>): Omit<Bill, 'id' | 'paid' | 'paidDateIso' | 'proofFileName' | 'linkedTransactionId'> | null => {
  const amount = Number.parseFloat(draft.amount.replace(',', '.'));
  if (!draft.title.trim() || Number.isNaN(amount) || amount <= 0) return null;
  return { title: draft.title.trim(), amountCents: toCents(amount), dueDateIso: draft.dueDateIso, category: draft.category, notes: draft.notes.trim() || undefined, autoCreateTransaction: draft.autoCreateTransaction, recurrence: draft.recurrence, recurrenceDay: Number(draft.dueDateIso.slice(8, 10)) };
};

export const buildTransactionPayload = (draft: ReturnType<typeof createEmptyTransactionDraft>, source: MoneyTransaction['source']): Omit<MoneyTransaction, 'id'> | null => {
  const amount = Number.parseFloat(draft.amount.replace(',', '.'));
  if (!draft.title.trim() || Number.isNaN(amount) || amount <= 0) return null;
  return { title: draft.title.trim(), amountCents: toCents(amount), dateIso: draft.dateIso, kind: draft.kind, category: draft.category, notes: draft.notes.trim() || undefined, source };
};

export const buildBudgetPayload = (draft: { category: string; amount: string }, monthIsoYYYYMM: string): Omit<Budget, 'id'> | null => {
  const amount = Number.parseFloat(draft.amount.replace(',', '.'));
  if (Number.isNaN(amount) || amount < 0) return null;
  return { monthIsoYYYYMM, category: draft.category, limitCents: toCents(amount) };
};

export const getBudgetSaveMode = (budgets: Budget[], monthIsoYYYYMM: string, category: string) => findBudgetForMonthCategory({ bills: [], transactions: [], budgets, savingsGoals: [], settings: { currency: 'ZAR' } }, monthIsoYYYYMM, category) ? 'update' : 'create';
