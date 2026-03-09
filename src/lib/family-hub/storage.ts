import { USERS, type UserId } from './constants';

export type Task = { id: string; title: string; dueDate?: string; completed: boolean };
export type Event = { id: string; title: string; date: string; type: 'event' | 'appointment' };
export type Payment = {
  id: string;
  title: string;
  amount: number;
  dueDate: string;
  paid: boolean;
  paidAt?: string;
  proofFilename?: string;
  linkedTransactionId?: string;
};
export type Transaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
  note?: string;
};
export type Budget = { id: string; category: string; limit: number; spent: number };
export type CashflowItem = { id: string; title: string; amount: number; direction: 'in' | 'out'; date: string };
export type Place = { id: string; name: string };
export type Reminder = { id: string; title: string; date: string };

export type FamilyHubState = {
  users: typeof USERS;
  activeUserId: UserId | null;
  tasks: Task[];
  events: Event[];
  payments: Payment[];
  transactions: Transaction[];
  budgets: Budget[];
  cashflowItems: CashflowItem[];
  places: Place[];
  reminders: Reminder[];
  settings: { autoCreateTransactionFromPayment: boolean };
};

const STORAGE_KEY = 'family-hub-state';

export const createInitialState = (): FamilyHubState => ({
  users: USERS,
  activeUserId: null,
  tasks: [],
  events: [],
  payments: [],
  transactions: [],
  budgets: [],
  cashflowItems: [],
  places: [],
  reminders: [],
  settings: { autoCreateTransactionFromPayment: true }
});

export const loadState = (): FamilyHubState => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return createInitialState();
  try {
    return { ...createInitialState(), ...JSON.parse(raw) as Partial<FamilyHubState> };
  } catch {
    return createInitialState();
  }
};

export const saveState = (state: FamilyHubState) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};
