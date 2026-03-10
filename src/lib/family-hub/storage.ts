import { USERS, type UserId } from './constants';
import type { PinStore } from './pin';

export type CalendarEvent = {
  id: string;
  title: string;
  date: string;
};

export type TaskItem = {
  id: string;
  title: string;
  completed: boolean;
  dueDate: string | null;
  shared: boolean;
  notes: string;
  ownerId: UserId;
};

export type PaymentItem = {
  id: string;
  title: string;
  amount: number;
  dueDate: string;
  paid: boolean;
};

export type RecurringPayment = {
  id: string;
  title: string;
  amount: number;
};

export type BudgetCategory = {
  id: string;
  label: string;
  amount: number;
};

export type UserSetupProfile = {
  openingBalance: number;
  monthlyIncome: number;
  recurringPayments: RecurringPayment[];
  budgetCategories: BudgetCategory[];
  avatarName?: string;
};

export type FamilyHubState = {
  users: typeof USERS;
  userPins: PinStore;
  setupCompleted: Record<UserId, boolean>;
  userSetupProfiles: Partial<Record<UserId, UserSetupProfile>>;
  activeUserId: UserId | null;
  setupUserId: UserId | null;
  calendar: { events: CalendarEvent[] };
  tasks: { items: TaskItem[] };
  money: { payments: PaymentItem[] };
};

const STORAGE_KEY = 'family-hub-state';

const setupDefaults: Record<UserId, boolean> = {
  johannes: false,
  nicole: false,
  ella: false,
  oliver: false
};

export const createInitialState = (): FamilyHubState => ({
  users: USERS,
  userPins: {},
  setupCompleted: { ...setupDefaults },
  userSetupProfiles: {},
  activeUserId: null,
  setupUserId: null,
  calendar: { events: [] },
  tasks: { items: [] },
  money: { payments: [] }
});

export const loadState = (): FamilyHubState => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return createInitialState();

  try {
    const parsed = JSON.parse(raw) as Partial<FamilyHubState>;
    const initial = createInitialState();

    const parsedTasks = parsed.tasks?.items ?? [];

    return {
      ...initial,
      ...parsed,
      users: USERS,
      setupCompleted: { ...initial.setupCompleted, ...(parsed.setupCompleted ?? {}) },
      userSetupProfiles: parsed.userSetupProfiles ?? {},
      calendar: { events: parsed.calendar?.events ?? [] },
      tasks: {
        items: parsedTasks
          .map((task) => ({
            ...task,
            dueDate: task.dueDate ?? null,
            shared: task.shared ?? false,
            notes: task.notes ?? '',
            ownerId: task.ownerId ?? 'johannes'
          }))
          .filter((task) => typeof task.id === 'string' && typeof task.title === 'string' && typeof task.completed === 'boolean')
      },
      money: { payments: parsed.money?.payments ?? [] }
    };
  } catch {
    return createInitialState();
  }
};

export const saveState = (state: FamilyHubState) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};
