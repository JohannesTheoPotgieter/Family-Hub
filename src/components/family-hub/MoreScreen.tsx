import { useState } from 'react';
import { AVATAR_ACCESSORIES, AVATAR_BACKGROUNDS, AVATAR_BASES, type UserId } from '../../lib/family-hub/constants';
import { formatPoints } from '../../lib/family-hub/format';
import type { FamilyHubState } from '../../lib/family-hub/storage';

type Props = {
  state: FamilyHubState;
  onAddPlace: (name: string) => void;
  onAddReminder: (title: string, date: string) => void;
  onToggleUserActive: (userId: UserId) => void;
  onChangePin: (userId: UserId, pin: string) => void;
  onAvatarAction: (userId: UserId, action: 'feed' | 'dance' | 'play' | 'adventure') => void;
  onAvatarCustomize: (userId: UserId, payload: { base: string; accessory: string; background: string }) => void;
  onExportData: () => void;
  onResetData: () => void;
};

export const MoreScreen = ({ state, onAddPlace, onAddReminder, onToggleUserActive, onChangePin, onAvatarAction, onAvatarCustomize, onExportData, onResetData }: Props) => {
  const [placeName, setPlaceName] = useState('');
  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderDate, setReminderDate] = useState('');

  return <section className="stack-lg">
    <article className="glass-card stack"><h3>Places</h3><input value={placeName} onChange={(e) => setPlaceName(e.target.value)} placeholder="Add first place" /><button className="btn btn-primary" onClick={() => { if (!placeName.trim()) return; onAddPlace(placeName.trim()); setPlaceName(''); }}>Save place</button>{!state.places.length ? <div className="empty-state">No places added yet.</div> : state.places.map((p) => <div key={p.id} className="chip">{p.name}</div>)}</article>

    <article className="glass-card stack"><h3>Users</h3>{state.users.map((u) => <div key={u.id} className="list-row"><span>{u.name} · {u.active ? 'Active' : 'Inactive'} · {state.usersProfile[u.id].setupCompleted ? 'Setup done' : 'Setup pending'}</span><button className="btn btn-ghost" onClick={() => onToggleUserActive(u.id)}>{u.active ? 'Deactivate' : 'Activate'}</button></div>)}<input type="password" maxLength={4} placeholder="New PIN for active user" onBlur={(e) => state.activeUserId && e.target.value.length === 4 && onChangePin(state.activeUserId, e.target.value)} /></article>

    <article className="glass-card stack"><h3>Reminders</h3><input value={reminderTitle} onChange={(e) => setReminderTitle(e.target.value)} placeholder="Add first reminder" /><input type="date" value={reminderDate} onChange={(e) => setReminderDate(e.target.value)} /><button className="btn btn-primary" onClick={() => { if (!reminderTitle.trim() || !reminderDate) return; onAddReminder(reminderTitle.trim(), reminderDate); setReminderTitle(''); }}>Save reminder</button>{!state.reminders.length ? <div className="empty-state">No reminders yet.</div> : state.reminders.map((r) => <div key={r.id} className="list-row"><span>{r.title}</span><span>{r.date}</span></div>)}</article>

    <article className="glass-card stack"><h3>Avatars</h3><p className="muted">Family points: {formatPoints(state.familyPoints)}</p>{state.users.map((u) => <div key={u.id} className="stack-sm list-tile"><strong>{u.name}</strong><p className="muted">{state.usersProfile[u.id].avatar.base} · {state.usersProfile[u.id].avatar.accessory} · mood: {state.usersProfile[u.id].avatar.mood} · {formatPoints(state.usersProfile[u.id].points)}</p><div className="chip-list"><button className="chip" onClick={() => onAvatarAction(u.id, 'feed')}>Feed</button><button className="chip" onClick={() => onAvatarAction(u.id, 'dance')}>Dance</button><button className="chip" onClick={() => onAvatarAction(u.id, 'play')}>Play ball</button><button className="chip" onClick={() => onAvatarAction(u.id, 'adventure')}>Mini adventure</button></div><div className="stack-sm"><select onChange={(e) => onAvatarCustomize(u.id, { base: e.target.value, accessory: state.usersProfile[u.id].avatar.accessory, background: state.usersProfile[u.id].avatar.background })}>{AVATAR_BASES.map((b) => <option key={b}>{b}</option>)}</select><select onChange={(e) => onAvatarCustomize(u.id, { base: state.usersProfile[u.id].avatar.base, accessory: e.target.value, background: state.usersProfile[u.id].avatar.background })}>{AVATAR_ACCESSORIES.map((a) => <option key={a}>{a}</option>)}</select><select onChange={(e) => onAvatarCustomize(u.id, { base: state.usersProfile[u.id].avatar.base, accessory: state.usersProfile[u.id].avatar.accessory, background: e.target.value })}>{AVATAR_BACKGROUNDS.map((bg) => <option key={bg}>{bg}</option>)}</select></div></div>)}</article>

    <article className="glass-card stack"><h3>Settings</h3><button className="btn btn-ghost" onClick={onExportData}>Export local data</button><button className="btn btn-ghost" onClick={onResetData}>Reset app data</button></article>
  </section>;
};
