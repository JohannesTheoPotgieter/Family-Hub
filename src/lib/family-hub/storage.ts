import { AVATAR_ACCESSORIES, AVATAR_BACKGROUNDS, AVATAR_BASES, USERS, type UserId } from './constants';
import type { PinStore } from './pin';

export type Task = {
  id: string;
  title: string;
  dueDate?: string;
  completed: boolean;
  waiting: boolean;
  shared: boolean;
  ownerId: UserId;
};

export type Event = { id: string; title: string; date: string; type: 'event' | 'appointment' };

export type Payment = {
  id: string;
  title: string;
  category: string;
  amount: number;
  dueDate: string;
  recurring: boolean;
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

export type AvatarProfile = {
  base: (typeof AVATAR_BASES)[number];
  accessory: (typeof AVATAR_ACCESSORIES)[number];
  background: (typeof AVATAR_BACKGROUNDS)[number];
  mood: 'happy' | 'sleepy' | 'excited' | 'chill';
  inventory: string[];
};

export type UserProfile = {
  setupCompleted: boolean;
  monthlyIncome: number;
  openingBalance: number;
  points: number;
  familyPointsContribution: number;
  avatar: AvatarProfile;
};

export type FamilyHubState = {
  users: typeof USERS;
  userPins: PinStore;
  activeUserId: UserId | null;
  setupUserId: UserId | null;
  usersProfile: Record<UserId, UserProfile>;
  tasks: Task[];
  events: Event[];
  payments: Payment[];
  transactions: Transaction[];
  budgets: Budget[];
  cashflowItems: CashflowItem[];
  places: Place[];
  reminders: Reminder[];
  settings: { autoCreateTransactionFromPayment: boolean };
  familyPoints: number;
};

const STORAGE_KEY = 'family-hub-state';

const profileDefaults = (index: number): AvatarProfile => ({
  base: AVATAR_BASES[index % AVATAR_BASES.length],
  accessory: AVATAR_ACCESSORIES[index % AVATAR_ACCESSORIES.length],
  background: AVATAR_BACKGROUNDS[index % AVATAR_BACKGROUNDS.length],
  mood: 'chill',
  inventory: ['Ball', 'Snack pouch']
});

export const createInitialState = (): FamilyHubState => ({
  users: USERS,
  userPins: {},
  activeUserId: null,
  setupUserId: null,
  usersProfile: {
    johannes: { setupCompleted: false, monthlyIncome: 0, openingBalance: 0, points: 0, familyPointsContribution: 0, avatar: profileDefaults(0) },
    nicole: { setupCompleted: false, monthlyIncome: 0, openingBalance: 0, points: 0, familyPointsContribution: 0, avatar: profileDefaults(1) },
    ella: { setupCompleted: false, monthlyIncome: 0, openingBalance: 0, points: 0, familyPointsContribution: 0, avatar: profileDefaults(2) },
    oliver: { setupCompleted: false, monthlyIncome: 0, openingBalance: 0, points: 0, familyPointsContribution: 0, avatar: profileDefaults(3) }
  },
  familyPoints: 0,
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
    return { ...createInitialState(), ...parsed, usersProfile: { ...createInitialState().usersProfile, ...parsed.usersProfile } };
  } catch {
    return createInitialState();
  }
};

export const saveState = (state: FamilyHubState) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};
