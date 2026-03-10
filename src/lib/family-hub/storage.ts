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
};

export type PaymentItem = {
  id: string;
  title: string;
  amount: number;
  dueDate: string;
  paid: boolean;
};

export type FamilyHubState = {
  users: typeof USERS;
  userPins: PinStore;
  setupCompleted: Record<UserId, boolean>;
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

    return {
      ...initial,
      ...parsed,
      users: USERS,
      setupCompleted: { ...initial.setupCompleted, ...(parsed.setupCompleted ?? {}) },
      calendar: { events: parsed.calendar?.events ?? [] },
      tasks: { items: parsed.tasks?.items ?? [] },
      money: { payments: parsed.money?.payments ?? [] }
    };
  } catch {
    return createInitialState();
  }
};

export const saveState = (state: FamilyHubState) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};
