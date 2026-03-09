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

export const USER_PINS: Record<UserId, string> = {
  johannes: '4821',
  nicole: '9307',
  ella: '0000',
  oliver: '0000'
};

export const TABS = ['Home', 'Calendar', 'Tasks', 'Money', 'More'] as const;
export type Tab = (typeof TABS)[number];

export const MONEY_TABS = ['Overview', 'Cashflow', 'Budget', 'Transactions', 'Payments'] as const;
export type MoneyTab = (typeof MONEY_TABS)[number];
