import { useMemo, useState } from 'react';
import type { User, UserId } from '../../lib/family-hub/constants';
import type { CalendarEvent, PlaceItem, TaskItem, AvatarProfile } from '../../lib/family-hub/storage';
import type { PinStore } from '../../lib/family-hub/pin';
import { FoundationBlock, ScreenIntro } from './BaselineScaffold';
import type { AvatarGameState } from '../../domain/avatarTypes';
import { AvatarHomeSection } from './AvatarHomeSection';

type MoreSection = 'avatars' | 'places' | 'users' | 'settings' | 'reminders';

type Props = {
  users: User[];
  avatars: Record<UserId, AvatarProfile>;
  activeUser: User | null;
  setupCompleted: Record<UserId, boolean>;
  userPins: PinStore;
  places: PlaceItem[];
  events: CalendarEvent[];
  tasks: TaskItem[];
  avatarGame: AvatarGameState;
  activeUserId: UserId | null;
  onCareAction: (userId: UserId, action: 'feed' | 'play' | 'clean' | 'rest' | 'pet' | 'story') => void;
  onChangePin: (currentPin: string, nextPin: string) => boolean;
  onSetUserPin: (userId: UserId, nextPin: string) => void;
  onAddPlace: (place: Omit<PlaceItem, 'id'>) => void;
  onUpdatePlace: (id: string, patch: Partial<Omit<PlaceItem, 'id'>>) => void;
  onExportData: () => string;
  onResetData: () => void;
};

const sectionOrder: MoreSection[] = ['avatars', 'places', 'users', 'settings', 'reminders'];

export const MoreScreen = ({
  users,
  avatars,
  activeUser,
  setupCompleted,
  userPins,
  places,
  events,
  tasks,
  avatarGame,
  activeUserId,
  onCareAction,
  onChangePin,
  onSetUserPin,
  onAddPlace,
  onUpdatePlace,
  onExportData,
  onResetData
}: Props) => {
  const [section, setSection] = useState<MoreSection>('users');

  const [currentPin, setCurrentPin] = useState('');
  const [nextPin, setNextPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinStatus, setPinStatus] = useState('');
  const [pinError, setPinError] = useState(false);

  const [selectedUserId, setSelectedUserId] = useState<UserId>(users[0]?.id ?? 'johannes');
  const [newUserPin, setNewUserPin] = useState('');
  const [userPinStatus, setUserPinStatus] = useState('');

  const [placeName, setPlaceName] = useState('');
  const [placeLocation, setPlaceLocation] = useState('');
  const [placeCost, setPlaceCost] = useState('');
  const [placeStatus, setPlaceStatus] = useState<PlaceItem['status']>('planning');
  const [placeNotes, setPlaceNotes] = useState('');

  const [settingsStatus, setSettingsStatus] = useState('');

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

    return {
      today: todayItems,
      week: weekItems,
      urgent: reminders.filter((item) => item.urgent).slice(0, 4)
    };
  }, [events, tasks]);

  return (
    <section className="stack-lg">
      <ScreenIntro
        badge="More"
        title="Family Utilities"
        subtitle="Intentional tools for avatars, people, places, reminders, and practical settings."
      />

      <div className="more-tab-row">
        {sectionOrder.map((item) => (
          <button
            key={item}
            className={`more-tab ${section === item ? 'is-selected' : ''}`}
            onClick={() => setSection(item)}
            type="button"
          >
            {item}
          </button>
        ))}
      </div>

      {section === 'avatars' ? (
        <FoundationBlock title="Avatar Home" description="Magical companion growth linked to real family activity.">
          <AvatarHomeSection users={users} activeUserId={activeUserId} avatarGame={avatarGame} onCareAction={onCareAction} />
        </FoundationBlock>
      ) : null}

      {section === 'places' ? (
        <FoundationBlock title="Places" description="Family places with status, rough cost, and clean notes.">
          <div className="places-list">
            {places.map((place) => (
              <article className="place-card" key={place.id}>
                <div className="place-head">
                  <h4>{place.name}</h4>
                  <select
                    value={place.status}
                    onChange={(event) => onUpdatePlace(place.id, { status: event.target.value as PlaceItem['status'] })}
                  >
                    <option value="planning">Planning</option>
                    <option value="booked">Booked</option>
                    <option value="visited">Visited</option>
                  </select>
                </div>
                <p className="muted">{place.location} • {place.roughCost}</p>
                <textarea
                  value={place.notes}
                  onChange={(event) => onUpdatePlace(place.id, { notes: event.target.value })}
                  rows={2}
                />
              </article>
            ))}
          </div>

          <div className="place-form glass-panel stack-sm">
            <h4>Add place</h4>
            <input value={placeName} onChange={(event) => setPlaceName(event.target.value)} placeholder="Place name" />
            <input value={placeLocation} onChange={(event) => setPlaceLocation(event.target.value)} placeholder="Location" />
            <div className="place-form-row">
              <input value={placeCost} onChange={(event) => setPlaceCost(event.target.value)} placeholder="Rough cost" />
              <select value={placeStatus} onChange={(event) => setPlaceStatus(event.target.value as PlaceItem['status'])}>
                <option value="planning">Planning</option>
                <option value="booked">Booked</option>
                <option value="visited">Visited</option>
              </select>
            </div>
            <textarea value={placeNotes} onChange={(event) => setPlaceNotes(event.target.value)} placeholder="Notes" rows={2} />
            <button
              className="btn btn-primary"
              type="button"
              disabled={!placeName.trim() || !placeLocation.trim()}
              onClick={() => {
                onAddPlace({
                  name: placeName.trim(),
                  location: placeLocation.trim(),
                  roughCost: placeCost.trim() || 'R 0',
                  status: placeStatus,
                  notes: placeNotes.trim()
                });
                setPlaceName('');
                setPlaceLocation('');
                setPlaceCost('');
                setPlaceNotes('');
                setPlaceStatus('planning');
              }}
            >
              Add place
            </button>
          </div>
        </FoundationBlock>
      ) : null}

      {section === 'users' ? (
        <FoundationBlock title="Users" description="Manage active status, setup progress, avatar shortcut, and future activation.">
          <div className="users-grid">
            {users.map((user) => {
              const isSetupComplete = Boolean(setupCompleted[user.id]);
              return (
                <article className="user-card" key={user.id}>
                  <div className="user-head-row">
                    <h4>{user.name}</h4>
                    <span className={`status-dot ${user.active ? 'is-active' : 'is-inactive'}`}>{user.active ? 'Active' : 'Inactive'}</span>
                  </div>
                  <div className="chip-list">
                    <span className="route-pill">Setup: {isSetupComplete ? 'Complete' : 'Pending'}</span>
                    <span className="route-pill">Avatar: {avatars[user.id].look.body}</span>
                    <span className="route-pill">PIN: {userPins[user.id] ? 'Set' : 'Missing'}</span>
                  </div>
                  {!user.active ? <p className="future-activation-note">Future activation ready for this family member.</p> : null}
                </article>
              );
            })}
          </div>

          <div className="place-form glass-panel stack-sm">
            <h4>PIN entry point</h4>
            <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value as UserId)}>
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
              placeholder="4-digit PIN"
              onChange={(event) => setNewUserPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
            />
            {userPinStatus ? <p className="status-banner is-success">{userPinStatus}</p> : null}
            <button
              className="btn btn-primary"
              type="button"
              disabled={newUserPin.length !== 4}
              onClick={() => {
                onSetUserPin(selectedUserId, newUserPin);
                setUserPinStatus('PIN saved for selected family member.');
                setNewUserPin('');
              }}
            >
              Save PIN
            </button>
          </div>
        </FoundationBlock>
      ) : null}

      {section === 'settings' ? (
        <FoundationBlock title="Settings" description="Minimal but real controls for data safety and PIN management.">
          <div className="stack-sm">
            <button
              className="btn btn-ghost"
              type="button"
              onClick={async () => {
                const serialized = onExportData();
                try {
                  await navigator.clipboard.writeText(serialized);
                  setSettingsStatus('Local data copied to clipboard.');
                } catch {
                  setSettingsStatus('Copy failed. You can still export in browser dev tools.');
                }
              }}
            >
              Export local data
            </button>

            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => {
                onResetData();
                setSettingsStatus('App data reset to starter state.');
              }}
            >
              Reset app data
            </button>

            <h4>Change your PIN</h4>
            <input
              className="pin-input"
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={currentPin}
              placeholder="Current PIN"
              onChange={(event) => setCurrentPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
            />
            <input
              className="pin-input"
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={nextPin}
              placeholder="New PIN"
              onChange={(event) => setNextPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
            />
            <input
              className="pin-input"
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={confirmPin}
              placeholder="Confirm new PIN"
              onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
            />

            {pinStatus ? <p className={`status-banner ${pinError ? 'is-error' : 'is-success'}`}>{pinStatus}</p> : null}
            {settingsStatus ? <p className="status-banner is-success">{settingsStatus}</p> : null}

            <button
              className="btn btn-primary"
              disabled={currentPin.length !== 4 || nextPin.length !== 4 || confirmPin.length !== 4}
              onClick={() => {
                if (nextPin !== confirmPin) {
                  setPinError(true);
                  setPinStatus('New PIN and confirmation do not match.');
                  return;
                }
                const changed = onChangePin(currentPin, nextPin);
                if (!changed) {
                  setPinError(true);
                  setPinStatus('Current PIN is incorrect.');
                  return;
                }
                setPinError(false);
                setPinStatus('PIN updated successfully.');
                setCurrentPin('');
                setNextPin('');
                setConfirmPin('');
              }}
            >
              Save new PIN
            </button>
          </div>
        </FoundationBlock>
      ) : null}

      {section === 'reminders' ? (
        <FoundationBlock title="Reminders" description="Urgent and upcoming family reminders grouped for quick action.">
          <div className="reminder-stack">
            <article className="reminder-group">
              <h4>Urgent</h4>
              {reminderGroups.urgent.length ? reminderGroups.urgent.map((item) => (
                <button className="reminder-card is-urgent" key={item.id} type="button">
                  <span>{item.type}</span>
                  <strong>{item.title}</strong>
                  <small>{item.date}</small>
                </button>
              )) : <p className="muted">No urgent reminders right now.</p>}
            </article>

            <article className="reminder-group">
              <h4>Today</h4>
              {reminderGroups.today.length ? reminderGroups.today.map((item) => (
                <button className="reminder-card" key={item.id} type="button">
                  <span>{item.type}</span>
                  <strong>{item.title}</strong>
                  <small>{item.date}</small>
                </button>
              )) : <p className="muted">Nothing scheduled for today.</p>}
            </article>

            <article className="reminder-group">
              <h4>This week</h4>
              {reminderGroups.week.length ? reminderGroups.week.map((item) => (
                <button className="reminder-card" key={item.id} type="button">
                  <span>{item.type}</span>
                  <strong>{item.title}</strong>
                  <small>{item.date}</small>
                </button>
              )) : <p className="muted">No upcoming reminders this week.</p>}
            </article>
          </div>
        </FoundationBlock>
      ) : null}

      {activeUser ? <p className="more-kicker">Signed in as {activeUser.name}</p> : null}
    </section>
  );
};
