import type { Tab, User } from './constants';

export type PermissionKey =
  | 'money_view'
  | 'money_edit'
  | 'calendar_connect'
  | 'places_edit'
  | 'pin_manage'
  | 'setup_restart'
  | 'data_export'
  | 'data_reset';

const rolePermissions: Record<User['role'], PermissionKey[]> = {
  parent: ['money_view', 'money_edit', 'calendar_connect', 'places_edit', 'pin_manage', 'setup_restart', 'data_export', 'data_reset'],
  adult: ['money_view', 'money_edit', 'calendar_connect', 'places_edit', 'pin_manage', 'setup_restart', 'data_export'],
  child: ['places_edit', 'pin_manage']
};

const roleTabAccess: Record<User['role'], Tab[]> = {
  parent: ['Home', 'Calendar', 'Tasks', 'Money', 'More'],
  adult: ['Home', 'Calendar', 'Tasks', 'Money', 'More'],
  child: ['Home', 'Calendar', 'Tasks', 'More']
};

export const hasPermission = (user: User | null, permission: PermissionKey) =>
  user ? rolePermissions[user.role].includes(permission) : false;

export const getTabsForUser = (user: User | null): Tab[] => (user ? roleTabAccess[user.role] : ['Home', 'Calendar', 'Tasks', 'Money', 'More']);

export const getRoleLabel = (user: User) => (
  user.role === 'parent'
    ? 'Parent'
    : user.role === 'adult'
      ? 'Adult'
      : 'Kid'
);
