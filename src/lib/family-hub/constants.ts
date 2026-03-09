export type UserId = 'johannes' | 'nicole' | 'ella' | 'oliver';

export type User = {
  id: UserId;
  name: string;
  active: boolean;
};

export const USERS: User[] = [
  { id: 'johannes', name: 'Johannes', active: true },
  { id: 'nicole', name: 'Nicole', active: true },
  { id: 'ella', name: 'Ella', active: false },
  { id: 'oliver', name: 'Oliver', active: false }
];

export const TABS = ['Home', 'Calendar', 'Tasks', 'Money', 'More'] as const;
export type Tab = (typeof TABS)[number];

export const MONEY_TABS = ['Overview', 'Cashflow', 'Budget', 'Transactions', 'Payments'] as const;
export type MoneyTab = (typeof MONEY_TABS)[number];

export const TASK_FILTERS = ['Today', 'Upcoming', 'Waiting', 'Done'] as const;
export type TaskFilter = (typeof TASK_FILTERS)[number];
