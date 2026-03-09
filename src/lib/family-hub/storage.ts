import { USERS, type UserId } from './constants';
import type { PinStore } from './pin';

export type Task = {
  id: string;
  title: string;
  dueDate?: string;
  completed: boolean;
  waiting: boolean;
  owner: UserId | 'shared';
};
export type Event = { id: string; title: string; date: string; type: 'event' | 'appointment' };
export type Payment = {
  id: string;
  title: string;
  category: string;
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
  paymentId?: string;
};
export type Budget = { id: string; category: string; limit: number; spent: number };
export type CashflowItem = { id: string; title: string; amount: number; direction: 'in' | 'out'; date: string };
export type Place = { id: string; name: string };
export type Reminder = { id: string; title: string; date: string };

export type UserSetup = {
  completed: boolean;
  openingBalance: number;
  monthlyIncome: number;
};

export type FamilyHubState = {
  users: typeof USERS;
  userPins: PinStore;
  activeUserId: UserId | null;
  userSetup: Record<UserId, UserSetup>;
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

const buildDefaultUserSetup = (): Record<UserId, UserSetup> => ({
  johannes: { completed: false, openingBalance: 0, monthlyIncome: 0 },
  nicole: { completed: false, openingBalance: 0, monthlyIncome: 0 },
  ella: { completed: false, openingBalance: 0, monthlyIncome: 0 },
  oliver: { completed: false, openingBalance: 0, monthlyIncome: 0 }
});

export const createInitialState = (): FamilyHubState => ({
  users: USERS,
  userPins: {},
  activeUserId: null,
  userSetup: buildDefaultUserSetup(),
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
    const parsed = JSON.parse(raw) as Partial<FamilyHubState>;
    const base = createInitialState();
    return {
      ...base,
      ...parsed,
      userSetup: { ...base.userSetup, ...(parsed.userSetup ?? {}) },
      settings: { ...base.settings, ...(parsed.settings ?? {}) }
    };
  } catch {
    return createInitialState();
  }
};

export const saveState = (state: FamilyHubState) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};
