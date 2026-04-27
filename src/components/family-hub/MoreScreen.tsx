import { useMemo, useState } from 'react';
import { FamilyChatPanel } from './FamilyChatPanel';
import type { User, UserId } from '../../lib/family-hub/constants';
import type { AppSettings, CalendarEvent, PlaceItem, TaskItem } from '../../lib/family-hub/storage';
import type { PinStore } from '../../lib/family-hub/pin';
import type { AvatarGameState } from '../../domain/avatarTypes';
import type { NormalizedEvent } from '../../domain/calendar';
import { FoundationBlock, ScreenIntro } from './BaselineScaffold';
import { AvatarHomeSection } from './AvatarHomeSection';
import { getRoleLabel } from '../../lib/family-hub/permissions';

type CareAction = 'feed' | 'play' | 'clean' | 'rest' | 'pet' | 'story';
type MoreSection = 'avatars' | 'places' | 'users' | 'settings' | 'reminders';

type Props = {
  users: User[];
  activeUser: User | null;
  activeUserId: UserId | null;
  canManageSensitiveData: boolean;
  canResetApp: boolean;
  canRestartSetup: boolean;
  avatarGame: AvatarGameState;
  setupCompleted: Record<UserId, boolean>;
  userPins: PinStore;
  places: PlaceItem[];
  events: CalendarEvent[];
  externalEvents: NormalizedEvent[];
  tasks: TaskItem[];
  auditLog: Array<{ id: string; type: string; detail: string; createdAtIso: string }>;
  onCareAction: (userId: UserId, action: CareAction) => void;
  onChangePin: (currentPin: string, nextPin: string) => Promise<boolean>;
  onAddPlace: (place: Omit<PlaceItem, 'id'>) => void;
  onUpdatePlace: (id: string, patch: Partial<Omit<PlaceItem, 'id'>>) => void;
  onExportData: () => string;
  onImportData: (raw: string) => void;
  onResetData: (mode?: 'soft' | 'hard' | 'money' | 'tasks' | 'calendar') => Promise<void> | void;
  onUpdateSettings: (update: Partial<AppSettings>) => void;
  onLock: () => void;
  onRestartSetup: (userId: UserId) => void;
};

const SECTION_TABS: { key: MoreSection; icon: string; label: string; blurb: string }[] = [
  { key: 'reminders', icon: '🔔', label: 'Alerts', blurb: 'See what needs attention soon.' },
  { key: 'users', icon: '👥', label: 'Family', blurb: 'Profiles, roles, and setup status.' },
  { key: 'avatars', icon: '🐾', label: 'Companion', blurb: 'Stars, streaks, and care.' },
  { key: 'places', icon: '📍', label: 'Outings', blurb: 'Ideas for family adventures later.' },
  { key: 'settings', icon: '⚙️', label: 'Settings', blurb: 'Security, backup, and reset tools.' }
];

const speciesEmoji: Record<string, string> = {
  foxling: '🦊',
  mooncat: '🐱',
  cloudbear: '🐻',
  bunny: '🐰'
};

const STATUS_LABELS: Record<PlaceItem['status'], string> = {
  planning: '🗺 Planning',
  booked: '✅ Booked',
  visited: '🏅 Visited'
};

const CALENDAR_SOURCE_LABELS: Record<string, string> = {
  google: 'Google calendar',
  microsoft: 'Outlook calendar',
  ics: 'ICS calendar'
};

export const MoreScreen = ({
  users,
  activeUser,
  activeUserId,
  canManageSensitiveData,
  canResetApp,
  canRestartSetup,
  avatarGame,
  setupCompleted,
  userPins,
  places,
  events,
  externalEvents,
  tasks,
  auditLog,
  onCareAction,
  onChangePin,
  onAddPlace,
  onUpdatePlace,
  onExportData,
  onImportData,
  onResetData,
  onUpdateSettings,
  onLock,
  onRestartSetup
}: Props) => {
  const [section, setSection] = useState<MoreSection>('reminders');

  const [currentPin, setCurrentPin] = useState('');
  const [nextPin, setNextPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinStatus, setPinStatus] = useState('');
  const [pinError, setPinError] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);

  const [placeName, setPlaceName] = useState('');
  const [placeLocation, setPlaceLocation] = useState('');
  const [placeCost, setPlaceCost] = useState('');
  const [placeStatus, setPlaceStatus] = useState<PlaceItem['status']>('planning');
  const [placeNotes, setPlaceNotes] = useState('');
  const [placeAdded, setPlaceAdded] = useState('');

  const [settingsStatus, setSettingsStatus] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [importStatus, setImportStatus] = useState('');

  const reminderGroups = useMemo(() => {
    const today = new Date();
    const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endToday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const endWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 8);

    const toDate = (iso: string) => {
      const parsed = new Date(`${iso}T12:00:00`);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    const reminders = [
      ...events.map((event) => ({
        id: `event-${event.id}`,
        title: event.title,
        date: event.date,
        type: event.kind === 'appointment' ? 'Appointment' : 'Event',
        urgent: false
      })),
      ...externalEvents.map((event) => ({
        id: `${event.provider}-${event.id}`,
        title: event.title,
        date: event.start.iso.slice(0, 10),
        type: CALENDAR_SOURCE_LABELS[event.provider] ?? 'Calendar',
        urgent: false
      })),
      ...tasks
        .filter((task) => Boolean(task.dueDate) && !task.completed)
        .map((task) => ({
          id: `task-${task.id}`,
          title: task.title,
          date: task.dueDate as string,
          type: 'Task',
          urgent: true
        }))
    ].sort((a, b) => a.date.localeCompare(b.date));

    const todayItems = reminders.filter((item) => {
      const date = toDate(item.date);
      return date ? date >= startToday && date < endToday : false;
    });

    const weekItems = reminders.filter((item) => {
      const date = toDate(item.date);
      return date ? date >= endToday && date < endWeek : false;
    });

    return { today: todayItems, week: weekItems };
  }, [events, externalEvents, tasks]);

  const handleImportFile = async (file: File | null) => {
    if (!file) return;
    try {
      onImportData(await file.text());
      setImportStatus('Backup imported. The household state was refreshed safely.');
    } catch {
      setImportStatus('That backup could not be imported.');
    }
  };

  const formatReminderDate = (iso: string) =>
    new Intl.DateTimeFormat('en-ZA', { weekday: 'short', month: 'short', day: 'numeric' })
      .format(new Date(`${iso}T12:00:00`));

  return (
    <section className="stack-lg">
      <ScreenIntro badge="Family" title="Family space" subtitle="See your household at a glance, manage people and places, and handle settings with clear safety guardrails." />
      <FamilyChatPanel />

      <div className="more-tab-row">
        {SECTION_TABS.map(({ key, icon, label, blurb }) => (
          <button
            key={key}
            className={`more-tab ${section === key ? 'is-selected' : ''}`}
            data-testid={`more-tab-${key}`}
            onClick={() => setSection(key)}
            type="button"
          >
            <span className="more-tab-icon">{icon}</span>
            <span className="more-tab-label">{label}</span>
            <span className="more-tab-blurb">{blurb}</span>
          </button>
        ))}
      </div>

      {section === 'reminders' && (
        <FoundationBlock title="🔔 Reminders" description="Tasks and events coming up soon.">
          <div className="reminder-stack">
            <article className="reminder-group">
              <h4>Today</h4>
              {reminderGroups.today.length ? reminderGroups.today.map((item) => (
                <div className={`reminder-card ${item.urgent ? 'is-urgent' : ''}`} key={item.id}>
                  <span>{item.type}</span>
                  <strong>{item.title}</strong>
                  <small>{formatReminderDate(item.date)}</small>
                </div>
              )) : <p className="muted">Nothing due today.</p>}
            </article>
            <article className="reminder-group">
              <h4>This week</h4>
              {reminderGroups.week.length ? reminderGroups.week.map((item) => (
                <div className={`reminder-card ${item.urgent ? 'is-urgent' : ''}`} key={item.id}>
                  <span>{item.type}</span>
                  <strong>{item.title}</strong>
                  <small>{formatReminderDate(item.date)}</small>
                </div>
              )) : <p className="muted">Clear week ahead.</p>}
            </article>
          </div>
        </FoundationBlock>
      )}

      {section === 'avatars' && (
        <FoundationBlock title="🐾 Companion home" description="Look after your household companions and family challenges in one place.">
          <div className="chip-list">
            <span className="route-pill">Family stars: {avatarGame.familyRewardTrack.familyStars}</span>
            <span className="route-pill">Family coins: {avatarGame.familyRewardTrack.familyCoins}</span>
            <span className="route-pill">Unlocked themes: {avatarGame.familyRewardTrack.unlockedRoomThemes.length}</span>
          </div>
          <AvatarHomeSection users={users} activeUserId={activeUserId} avatarGame={avatarGame} onCareAction={onCareAction} />
        </FoundationBlock>
      )}

      {section === 'places' && (
        <FoundationBlock title="📍 Outing ideas" description="Keep a lightweight list of places your family may want to try later.">
          {places.length === 0 ? (
            <div className="tasks-empty stack">
              <p className="tasks-empty-emoji">🗺</p>
              <p className="muted">No outing ideas saved yet. Add somewhere your family would love to try later.</p>
            </div>
          ) : null}
          <div className="places-list">
            {places.map((place) => (
              <article className="place-card" key={place.id}>
                <div className="place-head">
                  <div>
                    <h4>{place.name}</h4>
                    <p className="muted">{place.location}{place.roughCost ? ` · ${place.roughCost}` : ''}</p>
                  </div>
                  <select
                    value={place.status}
                    onChange={(event) => onUpdatePlace(place.id, { status: event.target.value as PlaceItem['status'] })}
                  >
                    <option value="planning">Planning</option>
                    <option value="booked">Booked</option>
                    <option value="visited">Visited</option>
                  </select>
                </div>
                <span className={`place-status-badge status-${place.status}`}>{STATUS_LABELS[place.status]}</span>
                {place.notes ? <p className="muted">{place.notes}</p> : null}
              </article>
            ))}
          </div>

          <div className="place-form glass-panel stack-sm">
            <h4>Add an outing idea</h4>
            <input
              value={placeName}
              placeholder="Place name (e.g. Cape Point)"
              data-testid="input-place-name"
              onChange={(event) => setPlaceName(event.target.value)}
            />
            <input
              value={placeLocation}
              placeholder="Location (e.g. Cape Town, SA)"
              data-testid="input-place-location"
              onChange={(event) => setPlaceLocation(event.target.value)}
            />
            <div className="place-form-row">
              <input
                value={placeCost}
                placeholder="Rough cost"
                onChange={(event) => setPlaceCost(event.target.value)}
              />
              <select value={placeStatus} onChange={(event) => setPlaceStatus(event.target.value as PlaceItem['status'])}>
                <option value="planning">Planning</option>
                <option value="booked">Booked</option>
                <option value="visited">Visited</option>
              </select>
            </div>
            <textarea
              value={placeNotes}
              placeholder="Notes (optional)"
              onChange={(event) => setPlaceNotes(event.target.value)}
              rows={2}
            />
            {placeAdded ? <p className="status-banner is-success">{placeAdded}</p> : null}
            <button
              className="btn btn-primary"
              data-testid="btn-add-place"
              type="button"
              disabled={!placeName.trim() || !placeLocation.trim()}
              onClick={() => {
                onAddPlace({
                  name: placeName.trim(),
                  location: placeLocation.trim(),
                  roughCost: placeCost.trim(),
                  status: placeStatus,
                  notes: placeNotes.trim()
                });
                setPlaceName('');
                setPlaceLocation('');
                setPlaceCost('');
                setPlaceNotes('');
                setPlaceStatus('planning');
                setPlaceAdded('Outing idea saved.');
                window.setTimeout(() => setPlaceAdded(''), 2000);
              }}
            >
              Save outing idea
            </button>
          </div>
        </FoundationBlock>
      )}

      {section === 'users' && (
        <FoundationBlock title="👥 Family members" description="View profile status in a safer read-only summary. PIN changes stay in each person’s own Settings screen.">
          <div className="users-grid">
            {users.map((user) => {
              const isSetupDone = Boolean(setupCompleted[user.id]);
              const companion = avatarGame.companionsByUserId[user.id];
              return (
                <article className="user-card" key={user.id}>
                  <div className="user-head-row">
                    <div className="user-identity">
                      <span className="user-avatar-emoji">{speciesEmoji[companion.species] ?? '🐾'}</span>
                      <h4>{user.name}</h4>
                    </div>
                    <span className={`status-dot ${user.active ? 'is-active' : 'is-inactive'}`}>
                      {getRoleLabel(user)}
                    </span>
                  </div>
                  <div className="chip-list">
                    <span className="route-pill">{isSetupDone ? '✓ Setup done' : '⏳ Setup pending'}</span>
                    <span className="route-pill">{userPins[user.id] ? '🔐 PIN set' : '⚠️ No PIN'}</span>
                    <span className="route-pill">Lv {companion.level}</span>
                  </div>
                  <p className="future-activation-note">
                    {user.role === 'child' ? 'Kid mode keeps Money hidden and sensitive settings limited.' : 'Can help manage shared home routines.'}
                  </p>
                </article>
              );
            })}
          </div>
        </FoundationBlock>
      )}

      {section === 'settings' && (
        <FoundationBlock title="⚙️ Settings" description="Data management and PIN security with clearer family safety guardrails.">
          <div className="stack-sm">
            <p className="route-pill">
              Signed in access: {activeUser ? getRoleLabel(activeUser) : 'Guest'} · {canManageSensitiveData ? 'Backups available' : 'Backups limited'}
            </p>
            <label className="task-field">
              <span>Family tone</span>
              <select
                defaultValue="balanced"
                onChange={(event) => {
                  onUpdateSettings({ familyMode: event.target.value as AppSettings['familyMode'] });
                  setSettingsStatus('Family tone preference saved.');
                }}
              >
                <option value="gentle">Gentle</option>
                <option value="balanced">Balanced</option>
                <option value="focused">Focused</option>
              </select>
            </label>
            {settingsStatus ? <p className="status-banner is-success">{settingsStatus}</p> : null}
            <h4>Change your PIN</h4>
            <input
              className="pin-input"
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={currentPin}
              placeholder="Current PIN"
              onChange={(event) => setCurrentPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
              disabled={pinBusy}
            />
            <input
              className="pin-input"
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={nextPin}
              placeholder="New PIN"
              onChange={(event) => setNextPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
              disabled={pinBusy}
            />
            <input
              className="pin-input"
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={confirmPin}
              placeholder="Confirm new PIN"
              onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
              disabled={pinBusy}
            />
            {pinStatus ? <p className={`status-banner ${pinError ? 'is-error' : 'is-success'}`}>{pinStatus}</p> : null}
            <button
              className="btn btn-primary"
              type="button"
              disabled={currentPin.length !== 4 || nextPin.length !== 4 || confirmPin.length !== 4 || pinBusy}
              onClick={async () => {
                if (nextPin !== confirmPin) {
                  setPinError(true);
                  setPinStatus('New PINs do not match.');
                  return;
                }
                setPinBusy(true);
                const changed = await onChangePin(currentPin, nextPin);
                if (!changed) {
                  setPinError(true);
                  setPinStatus('Current PIN is incorrect.');
                  setPinBusy(false);
                  return;
                }
                setPinError(false);
                setPinStatus('PIN updated successfully.');
                setCurrentPin('');
                setNextPin('');
                setConfirmPin('');
                setPinBusy(false);
              }}
            >
              {pinBusy ? 'Updating…' : 'Update PIN'}
            </button>

            <div className="settings-divider" />

            <h4>Session</h4>
            <button className="btn btn-ghost" type="button" onClick={onLock}>
              Lock Family Hub
            </button>

            {activeUserId && canRestartSetup ? (
              <button className="btn btn-ghost" type="button" onClick={() => onRestartSetup(activeUserId)}>
                Redo startup setup
              </button>
            ) : activeUserId ? <p className="muted">Only adult household members can restart setup.</p> : null}

            <div className="settings-divider" />

            <h4>Data</h4>
            {canManageSensitiveData ? (
              <div className="stack-sm">
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={async () => {
                    const serialized = onExportData();
                    try {
                      await navigator.clipboard.writeText(serialized);
                      setSettingsStatus('Private household data copied to clipboard.');
                    } catch {
                      const blob = new Blob([serialized], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const anchor = document.createElement('a');
                      anchor.href = url;
                      anchor.download = 'family-hub-backup.json';
                      anchor.click();
                      URL.revokeObjectURL(url);
                      setSettingsStatus('Backup downloaded as a file.');
                    }
                  }}
                >
                  Export backup
                </button>
                <label className="btn btn-ghost">
                  Import backup
                  <input type="file" accept="application/json" hidden onChange={(event) => void handleImportFile(event.target.files?.[0] ?? null)} />
                </label>
                {importStatus ? <p className="status-banner is-success">{importStatus}</p> : null}
              </div>
            ) : (
              <p className="muted">Exports are limited to adult household members.</p>
            )}

            {!confirmReset && canResetApp ? (
              <div className="stack-sm">
                <button className="btn btn-ghost" type="button" onClick={() => void onResetData('soft')}>
                  Reset current session
                </button>
                <button className="btn btn-ghost" type="button" onClick={() => void onResetData('calendar')}>
                  Reset calendar data
                </button>
                <button className="btn btn-ghost" type="button" onClick={() => void onResetData('money')}>
                  Reset money data
                </button>
                <button className="btn btn-ghost btn-danger-ghost" type="button" onClick={() => setConfirmReset(true)}>
                  Hard reset all app data
                </button>
              </div>
            ) : canResetApp ? (
              <div className="stack-sm">
                <p className="error-banner">Hard reset clears this household from the device and server-backed calendar connections. Are you sure?</p>
                <div className="task-composer-actions">
                  <button className="btn btn-ghost" type="button" onClick={() => setConfirmReset(false)}>Cancel</button>
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => {
                      void onResetData('hard');
                      setConfirmReset(false);
                      setSettingsStatus('Hard reset completed.');
                    }}
                  >
                    Yes, hard reset
                  </button>
                </div>
              </div>
            ) : (
              <p className="muted">Full reset is reserved for the household parent profile.</p>
            )}

            {auditLog.length ? (
              <div className="stack-sm">
                <h4>Safety log</h4>
                {auditLog.slice(0, 5).map((entry) => (
                  <div key={entry.id} className="reminder-card">
                    <span>{entry.type}</span>
                    <strong>{entry.detail}</strong>
                    <small>{new Intl.DateTimeFormat('en-ZA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(entry.createdAtIso))}</small>
                  </div>
                ))}
              </div>
            ) : null}

            {settingsStatus ? <p className="status-banner is-success">{settingsStatus}</p> : null}
          </div>
        </FoundationBlock>
      )}

      {activeUser ? (
        <p className="more-kicker">
          Signed in as <strong>{activeUser.name}</strong>
        </p>
      ) : null}
    </section>
  );
};
