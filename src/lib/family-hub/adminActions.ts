import { resetCalendarConnections } from '../../integrations/calendar';
import { clearPersistedState, exportBackup, importBackup } from './persistence';
import { createResetState } from './appState';
import type { FamilyHubState } from './storage';

export type AdminResetMode = 'soft' | 'hard' | 'money' | 'tasks' | 'calendar';
export type AuditEntry = { id: string; type: string; createdAtIso: string; detail: string };

export const appendAuditEntry = (state: FamilyHubState, type: string, detail: string): FamilyHubState => ({
  ...state,
  auditLog: [
    { id: `${type}-${Date.now()}`, type, detail, createdAtIso: new Date().toISOString() },
    ...(state.auditLog ?? [])
  ].slice(0, 60)
});

export const createResetStateForMode = async (state: FamilyHubState, mode: AdminResetMode) => {
  if (mode === 'hard') {
    clearPersistedState();
    await resetCalendarConnections();
    return appendAuditEntry(createResetState(), 'reset.hard', 'Cleared all app and provider data.');
  }

  if (mode === 'soft') {
    return appendAuditEntry(
      {
        ...state,
        activeUserId: null,
        setupUserId: null
      },
      'reset.soft',
      'Locked the app without deleting household data.'
    );
  }

  if (mode === 'money') {
    return appendAuditEntry(
      { ...state, money: createResetState().money },
      'reset.money',
      'Reset money data only.'
    );
  }

  if (mode === 'tasks') {
    return appendAuditEntry(
      { ...state, tasks: createResetState().tasks },
      'reset.tasks',
      'Reset tasks only.'
    );
  }

  await resetCalendarConnections();
  return appendAuditEntry(
    { ...state, calendar: createResetState().calendar },
    'reset.calendar',
    'Reset calendar connections and events.'
  );
};

export { exportBackup, importBackup };
