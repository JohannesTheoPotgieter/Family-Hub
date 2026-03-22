import { clearState, createInitialState, loadState, saveState, type FamilyHubState } from './storage';

export type PersistenceAdapter = {
  load: () => FamilyHubState;
  save: (state: FamilyHubState) => void;
  clear: () => void;
};

export const localPersistenceAdapter: PersistenceAdapter = {
  load: loadState,
  save: saveState,
  clear: clearState
};

export const createServerSyncScaffold = () => ({
  mode: 'scaffold' as const,
  enabled: false,
  status: 'idle' as const,
  description: 'Local-first today, ready for future household sync.'
});

export const exportBackup = (state: FamilyHubState) =>
  JSON.stringify(
    {
      version: 1,
      exportedAtIso: new Date().toISOString(),
      app: 'family-hub',
      state: { ...state, activeUserId: null, setupUserId: null }
    },
    null,
    2
  );

export const importBackup = (raw: string): FamilyHubState => {
  const parsed = JSON.parse(raw) as { state?: FamilyHubState } | FamilyHubState;
  const next = 'state' in parsed && parsed.state ? parsed.state : parsed;
  saveState({ ...createInitialState(), ...next, activeUserId: null, setupUserId: null });
  return loadState();
};

export const clearPersistedState = () => localPersistenceAdapter.clear();
