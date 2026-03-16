import { useMemo, useState } from 'react';
import type { User, UserId } from '../../lib/family-hub/constants';
import type { CalendarEvent, PlaceItem, TaskItem } from '../../lib/family-hub/storage';
import type { PinStore } from '../../lib/family-hub/pin';
import type { AvatarGameState } from '../../domain/avatarTypes';
import { FoundationBlock, ScreenIntro } from './BaselineScaffold';
import { AvatarHomeSection } from './AvatarHomeSection';

type CareAction = 'feed' | 'play' | 'clean' | 'rest' | 'pet' | 'story';
type MoreSection = 'avatars' | 'places' | 'users' | 'settings' | 'reminders';

type Props = {
  users: User[];
  activeUser: User | null;
  activeUserId: UserId | null;
  avatarGame: AvatarGameState;
  setupCompleted: Record<UserId, boolean>;
  userPins: PinStore;
  places: PlaceItem[];
  events: CalendarEvent[];
  tasks: TaskItem[];
  onCareAction: (userId: UserId, action: CareAction) => void;
  onChangePin: (currentPin: string, nextPin: string) => Promise<boolean>;
  onSetUserPin: (userId: UserId, nextPin: string) => Promise<void>;
  onAddPlace: (place: Omit<PlaceItem, 'id'>) => void;
  onUpdatePlace: (id: string, patch: Partial<Omit<PlaceItem, 'id'>>) => void;
  onExportData: () => string;
  onResetData: () => void;
  onLock: () => void;
};

const SECTION_TABS: { key: MoreSection; icon: string; label: string }[] = [
  { key: 'reminders', icon: '🔔', label: 'Alerts' },
  { key: 'avatars', icon: '🐾', label: 'Companions' },
  { key: 'places', icon: '📍', label: 'Places' },
  { key: 'users', icon: '👥', label: 'People' },
  { key: 'settings', icon: '⚙️', label: 'Settings' }
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

export const MoreScreen = ({
  users,
  activeUser,
  activeUserId,
  avatarGame,
  setupCompleted,
  userPins,
  places,
  events,
  tasks,
  onCareAction,
  onChangePin,
  onSetUserPin,
  onAddPlace,
  onUpdatePlace,
  onExportData,
  onResetData,
  onLock
}: Props) => {
  const [section, setSection] = useState<MoreSection>('reminders');

  const [currentPin, setCurrentPin] = useState('');
  const [nextPin, setNextPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinStatus, setPinStatus] = useState('');
  const [pinError, setPinError] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);

  const [selectedUserId, setSelectedUserId] = useState<UserId>(users[0]?.id ?? 'johannes');
  const [newUserPin, setNewUserPin] = useState('');
  const [userPinStatus, setUserPinStatus] = useState('');
  const [userPinBusy, setUserPinBusy] = useState(false);

  const [placeName, setPlaceName] = useState('');
  const [placeLocation, setPlaceLocation] = useState('');
  const [placeCost, setPlaceCost] = useState('');
  const [placeStatus, setPlaceStatus] = useState<PlaceItem['status']>('planning');
  const [placeNotes, setPlaceNotes] = useState('');
  const [placeAdded, setPlaceAdded] = useState('');

  const [settingsStatus, setSettingsStatus] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);

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
  }, [events, tasks]);

  const formatReminderDate = (iso: string) =>
    new Intl.DateTimeFormat('en-ZA', { weekday: 'short', month: 'short', day: 'numeric' })
      .format(new Date(`${iso}T12:00:00`));

  return (
    <section className="stack-lg">
      <ScreenIntro badge="More" title="Family tools" subtitle="Manage companions, places, people, alerts and settings." />

      <div className="more-tab-row">
        {SECTION_TABS.map(({ key, icon, label }) => (
          <button
            key={key}
            className={`more-tab ${section === key ? 'is-selected' : ''}`}
            data-testid={`more-tab-${key}`}
            onClick={() => setSection(key)}
            type="button"
          >
            <span className="more-tab-icon">{icon}</span>
            <span className="more-tab-label">{label}</span>
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
        <FoundationBlock title="📍 Places to visit" description="Track places your family wants to go.">
          {places.length === 0 ? (
            <div className="tasks-empty stack">
              <p className="tasks-empty-emoji">🗺</p>
              <p className="muted">No places saved yet. Add somewhere you would love to visit.</p>
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
            <h4>Add a place</h4>
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
                setPlaceAdded('Place saved.');
                window.setTimeout(() => setPlaceAdded(''), 2000);
              }}
            >
              Add place
            </button>
          </div>
        </FoundationBlock>
      )}

      {section === 'users' && (
        <FoundationBlock title="👥 Family members" description="View and manage profile status for each family member.">
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
                      {user.active ? 'Active' : 'Future'}
                    </span>
                  </div>
                  <div className="chip-list">
                    <span className="route-pill">{isSetupDone ? '✓ Setup done' : '⏳ Setup pending'}</span>
                    <span className="route-pill">{userPins[user.id] ? '🔐 PIN set' : '⚠️ No PIN'}</span>
                    <span className="route-pill">Lv {companion.level}</span>
                  </div>
                  {!user.active ? <p className="future-activation-note">This profile will be available when activated.</p> : null}
                </article>
              );
            })}
          </div>

          <div className="place-form glass-panel stack-sm">
            <h4>Set or reset a PIN</h4>
            <p className="muted">Select a family member and set their 4-digit PIN.</p>
            <select
              value={selectedUserId}
              data-testid="select-user-for-pin"
              onChange={(event) => setSelectedUserId(event.target.value as UserId)}
              disabled={userPinBusy}
            >
              {users.map((user) => (
                <option key={user.id} value={user.id}>{user.name}</option>
              ))}
            </select>
            <input
              className="pin-input"
              value={newUserPin}
              type="password"
              inputMode="numeric"
              maxLength={4}
              placeholder="New 4-digit PIN"
              data-testid="input-new-user-pin"
              onChange={(event) => setNewUserPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
              disabled={userPinBusy}
            />
            {userPinStatus ? <p className="status-banner is-success">{userPinStatus}</p> : null}
            <button
              className="btn btn-primary"
              data-testid="btn-save-user-pin"
              type="button"
              disabled={newUserPin.length !== 4 || userPinBusy}
              onClick={async () => {
                setUserPinBusy(true);
                await onSetUserPin(selectedUserId, newUserPin);
                setUserPinStatus('PIN saved.');
                setNewUserPin('');
                setUserPinBusy(false);
                window.setTimeout(() => setUserPinStatus(''), 2500);
              }}
            >
              {userPinBusy ? 'Saving…' : 'Save PIN'}
            </button>
          </div>
        </FoundationBlock>
      )}

      {section === 'settings' && (
        <FoundationBlock title="⚙️ Settings" description="Data management and PIN security.">
          <div className="stack-sm">
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

            <div className="settings-divider" />

            <h4>Data</h4>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={async () => {
                const serialized = onExportData();
                try {
                  await navigator.clipboard.writeText(serialized);
                  setSettingsStatus('Data copied to clipboard.');
                } catch {
                  setSettingsStatus('Copy failed. Use browser devtools to access localStorage.');
                }
              }}
            >
              Export local data
            </button>

            {!confirmReset ? (
              <button className="btn btn-ghost btn-danger-ghost" type="button" onClick={() => setConfirmReset(true)}>
                Reset all app data
              </button>
            ) : (
              <div className="stack-sm">
                <p className="error-banner">This will erase all your data. Are you sure?</p>
                <div className="task-composer-actions">
                  <button className="btn btn-ghost" type="button" onClick={() => setConfirmReset(false)}>Cancel</button>
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => {
                      onResetData();
                      setConfirmReset(false);
                      setSettingsStatus('App data reset.');
                    }}
                  >
                    Yes, reset
                  </button>
                </div>
              </div>
            )}

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
