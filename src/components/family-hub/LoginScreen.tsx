import { useState } from 'react';
import type { User, UserId } from '../../lib/family-hub/constants';

type Props = {
  users: User[];
  hasPin: (userId: UserId) => boolean;
  onUnlock: (userId: UserId, pin: string) => boolean;
  onSelectForSetup: (userId: UserId) => void;
};

export const LoginScreen = ({ users, hasPin, onUnlock, onSelectForSetup }: Props) => {
  const activeUsers = users.filter((u) => u.active);
  const inactiveUsers = users.filter((u) => !u.active);
  const [selectedUser, setSelectedUser] = useState<UserId>(activeUsers[0]?.id ?? 'johannes');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const submit = () => {
    if (!hasPin(selectedUser)) {
      onSelectForSetup(selectedUser);
      return;
    }
    if (!onUnlock(selectedUser, pin)) return setError('Incorrect PIN. Please try again.');
    setPin('');
    setError('');
  };

  return (
    <main className="login-shell">
      <div className="bg-orb bg-orb--top" />
      <div className="bg-orb bg-orb--bottom" />
      <section className="glass-card login-card premium">
        <p className="eyebrow">Family Hub</p>
        <h1>Household unlock</h1>
        <p className="subtitle">A calm, secure home for your plans, tasks, and money.</p>
        <div className="profile-grid">
          {activeUsers.map((user) => (
            <button key={user.id} className={`profile-chip ${selectedUser === user.id ? 'is-active' : ''}`} onClick={() => { setSelectedUser(user.id); setPin(''); setError(''); }}>
              {user.name}
            </button>
          ))}
        </div>
        {hasPin(selectedUser) ? (
          <>
            <label className="field-label">4-digit PIN</label>
            <input className="pin-input" type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="••••" />
          </>
        ) : (
          <div className="empty-state">This profile needs first-time setup.</div>
        )}
        {error ? <div className="error-banner">{error}</div> : null}
        <button className="btn btn-primary" onClick={submit} disabled={hasPin(selectedUser) && pin.length !== 4}>{hasPin(selectedUser) ? 'Unlock Family Hub' : 'Start setup'}</button>
        <div className="inactive-users">
          <p className="small-title">Inactive future profiles</p>
          <div className="chip-list">{inactiveUsers.map((u) => <span key={u.id} className="chip chip-muted">{u.name}</span>)}</div>
        </div>
      </section>
    </main>
  );
};
