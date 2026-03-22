import type { Tab, User } from './constants';
import type { AppSettings } from './storage';

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
  adult: ['money_view', 'money_edit', 'calendar_connect', 'places_edit', 'pin_manage', 'setup_restart', 'data_export', 'data_reset'],
  child: ['places_edit', 'pin_manage']
};

const roleTabAccess: Record<User['role'], Tab[]> = {
  parent: ['Home', 'Calendar', 'Tasks', 'Money', 'More'],
  adult: ['Home', 'Calendar', 'Tasks', 'Money', 'More'],
  child: ['Home', 'Calendar', 'Tasks', 'More']
};

export const hasPermission = (user: User | null, permission: PermissionKey, settings?: Pick<AppSettings, 'requireParentForReset'>) => {
  if (!user || !rolePermissions[user.role].includes(permission)) return false;
  if (permission === 'data_reset' && settings?.requireParentForReset !== false) return user.role === 'parent';
  return true;
};

export const getTabsForUser = (user: User | null, settings?: Pick<AppSettings, 'hideMoneyForKids'>): Tab[] => {
  if (!user) return ['Home', 'Calendar', 'Tasks', 'Money', 'More'];
  if (user.role === 'child' && settings?.hideMoneyForKids === false) return ['Home', 'Calendar', 'Tasks', 'Money', 'More'];
  return roleTabAccess[user.role];
};

export const getRoleLabel = (user: User) => (
  user.role === 'parent'
    ? 'Parent'
    : user.role === 'adult'
      ? 'Adult'
      : 'Kid'
);
