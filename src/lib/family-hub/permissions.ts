import type { Tab, User, FamilyRole, LegacyRole } from './constants';
import type { AppSettings } from './storage';

export type PermissionKey =
  | 'money_view'
  | 'money_edit'
  | 'calendar_connect'
  | 'calendar_edit'
  | 'task_edit'
  | 'task_assign'
  | 'places_edit'
  | 'pin_manage'
  | 'setup_restart'
  | 'data_export'
  | 'data_reset';

const roleMap: Record<LegacyRole, FamilyRole> = {
  parent: 'parent_admin',
  adult: 'adult_editor',
  child: 'child_limited'
};

const rolePermissions: Record<FamilyRole, PermissionKey[]> = {
  parent_admin: ['money_view', 'money_edit', 'calendar_connect', 'calendar_edit', 'task_edit', 'task_assign', 'places_edit', 'pin_manage', 'setup_restart', 'data_export', 'data_reset'],
  adult_editor: ['money_view', 'money_edit', 'calendar_connect', 'calendar_edit', 'task_edit', 'task_assign', 'places_edit', 'pin_manage', 'setup_restart', 'data_export', 'data_reset'],
  child_limited: ['calendar_edit', 'task_edit', 'places_edit', 'pin_manage']
};

const roleTabAccess: Record<FamilyRole, Tab[]> = {
  parent_admin: ['Home', 'Calendar', 'Tasks', 'Money', 'More'],
  adult_editor: ['Home', 'Calendar', 'Tasks', 'Money', 'More'],
  child_limited: ['Home', 'Calendar', 'Tasks', 'More']
};

export const getRoleKey = (user: User | null): FamilyRole | null => {
  if (!user) return null;
  return user.roleV2 ?? roleMap[user.role];
};

export const resolvePermissionBundle = (user: User | null, settings?: Pick<AppSettings, 'hideMoneyForKids' | 'requireParentForReset'>) => {
  const roleKey = getRoleKey(user);
  const permissions = roleKey ? rolePermissions[roleKey] : [];
  const canReset = roleKey === 'parent_admin' || (roleKey === 'adult_editor' && settings?.requireParentForReset === false);
  const canViewMoney = permissions.includes('money_view') || (roleKey === 'child_limited' && settings?.hideMoneyForKids === false);
  return {
    roleKey,
    permissions,
    canViewMoney,
    canEditMoney: permissions.includes('money_edit'),
    canConnectCalendar: permissions.includes('calendar_connect'),
    canEditCalendar: permissions.includes('calendar_edit'),
    canEditTasks: permissions.includes('task_edit'),
    canAssignTasks: permissions.includes('task_assign'),
    canEditPlaces: permissions.includes('places_edit'),
    canRestartSetup: permissions.includes('setup_restart'),
    canExport: permissions.includes('data_export'),
    canReset,
    moneyVisibility: roleKey === 'child_limited' ? (settings?.hideMoneyForKids === false ? 'summary' : 'hidden') : 'full'
  } as const;
};

export const hasPermission = (user: User | null, permission: PermissionKey, settings?: Pick<AppSettings, 'requireParentForReset'>) => {
  const roleKey = getRoleKey(user);
  if (!roleKey || !rolePermissions[roleKey].includes(permission)) return false;
  if (permission === 'data_reset' && settings?.requireParentForReset !== false) return roleKey === 'parent_admin';
  return true;
};

export const getTabsForUser = (user: User | null, settings?: Pick<AppSettings, 'hideMoneyForKids'>): Tab[] => {
  if (!user) return ['Home', 'Calendar', 'Tasks', 'Money', 'More'];
  const roleKey = getRoleKey(user);
  if (!roleKey) return ['Home', 'Calendar', 'Tasks', 'Money', 'More'];
  if (roleKey === 'child_limited' && settings?.hideMoneyForKids === false) return ['Home', 'Calendar', 'Tasks', 'Money', 'More'];
  return roleTabAccess[roleKey];
};

export const getRoleLabel = (user: User) => {
  const roleKey = getRoleKey(user);
  return roleKey === 'parent_admin' ? 'Parent admin' : roleKey === 'adult_editor' ? 'Adult editor' : 'Child limited';
};
