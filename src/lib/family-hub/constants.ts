export type UserId = 'johannes' | 'nicole' | 'ella' | 'oliver';

export type LegacyRole = 'parent' | 'adult' | 'child';
export type FamilyRole = 'parent_admin' | 'adult_editor' | 'child_limited';

export type User = {
  id: UserId;
  name: string;
  active: boolean;
  role: LegacyRole;
  roleV2?: FamilyRole;
};

export const USERS: User[] = [
  { id: 'johannes', name: 'Johannes', active: true, role: 'parent' },
  { id: 'nicole', name: 'Nicole', active: true, role: 'adult' },
  { id: 'ella', name: 'Ella', active: true, role: 'child' },
  { id: 'oliver', name: 'Oliver', active: true, role: 'child' }
];

export const TABS = ['Home', 'Calendar', 'Tasks', 'Money', 'More'] as const;
export type Tab = (typeof TABS)[number];
