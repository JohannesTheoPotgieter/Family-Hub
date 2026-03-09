import { useState } from 'react';
import type { User, UserId } from '../../lib/family-hub/constants';
import type { Place, Reminder, UserSetup } from '../../lib/family-hub/storage';

type Props = {
  users: User[];
  userSetup: Record<UserId, UserSetup>;
  places: Place[];
  reminders: Reminder[];
  activeUserId: UserId;
  onAddPlace: (name: string) => void;
  onAddReminder: (title: string, date: string) => void;
  onToggleUserActive: (userId: UserId) => void;
  onChangePin: (userId: UserId, pin: string) => void;
  onExportData: () => void;
  onResetData: () => void;
};

export const MoreScreen = ({ users, userSetup, places, reminders, activeUserId, onAddPlace, onAddReminder, onToggleUserActive, onChangePin, onExportData, onResetData }: Props) => {
  const [placeName, setPlaceName] = useState('');
  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderDate, setReminderDate] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  return <section className="stack-lg">
    <div className="screen-title"><h2>More</h2><p className="muted">Users, places, reminders, and settings.</p></div>
    <article className="glass-card stack"><h3>Users</h3>{users.map((user) => <div key={user.id} className="list-row"><span>{user.name} <small className="muted">• {userSetup[user.id].completed ? 'Setup complete' : 'Setup pending'}</small></span><button className={`chip ${user.active ? 'chip-active' : 'chip-muted'}`} onClick={() => onToggleUserActive(user.id)}>{user.active ? 'Active' : 'Inactive'}</button></div>)}</article>
    <article className="glass-card stack"><h3>PIN management</h3><input type="password" maxLength={4} inputMode="numeric" value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="New 4-digit PIN" /><input type="password" maxLength={4} inputMode="numeric" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Confirm PIN" /><button className="btn btn-primary" disabled={newPin.length !== 4 || confirmPin.length !== 4 || newPin !== confirmPin} onClick={() => { onChangePin(activeUserId, newPin); setNewPin(''); setConfirmPin(''); }}>Change my PIN</button></article>
    <article className="glass-card stack"><h3>Places</h3><form className="stack" onSubmit={(e) => { e.preventDefault(); if (!placeName.trim()) return; onAddPlace(placeName.trim()); setPlaceName(''); }}><input value={placeName} onChange={(e) => setPlaceName(e.target.value)} placeholder="Add first place" /><button className="btn btn-primary" type="submit">Save place</button></form>{places.length ? places.map((p) => <div key={p.id} className="list-row">{p.name}</div>) : <div className="empty-state">No places added yet.</div>}</article>
    <article className="glass-card stack"><h3>Reminders</h3><form className="stack" onSubmit={(e) => { e.preventDefault(); if (!reminderTitle.trim() || !reminderDate) return; onAddReminder(reminderTitle.trim(), reminderDate); setReminderTitle(''); setReminderDate(''); }}><input value={reminderTitle} onChange={(e) => setReminderTitle(e.target.value)} placeholder="Add reminder" /><input type="date" value={reminderDate} onChange={(e) => setReminderDate(e.target.value)} /><button className="btn btn-primary" type="submit">Save reminder</button></form>{reminders.length ? reminders.map((r) => <div key={r.id} className="list-row"><span>{r.title}</span><span>{r.date}</span></div>) : <div className="empty-state">No reminders yet.</div>}</article>
    <article className="glass-card stack"><h3>Settings</h3><button className="btn btn-ghost" onClick={onExportData}>Export local data</button><button className="btn btn-ghost" onClick={onResetData}>Reset app data</button></article>
  </section>;
};
