import { useMemo, useState } from 'react';
import type { User, UserId } from '../../lib/family-hub/constants';

type Props = {
  users: User[];
  hasPin: (userId: UserId) => boolean;
  isSetupComplete: (userId: UserId) => boolean;
  onUnlock: (userId: UserId, pin: string) => boolean;
  onStartSetup: (userId: UserId) => void;
};

export const LoginScreen = ({ users, hasPin, isSetupComplete, onUnlock, onStartSetup }: Props) => {
  const activeUsers = users.filter((u) => u.active);
  const inactiveUsers = users.filter((u) => !u.active);
  const [selectedUser, setSelectedUser] = useState<UserId>(activeUsers[0]?.id ?? 'johannes');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const needsSetup = useMemo(() => !isSetupComplete(selectedUser) || !hasPin(selectedUser), [isSetupComplete, hasPin, selectedUser]);

  return (
    <main className="login-shell">
      <div className="bg-orb bg-orb--top" />
      <div className="bg-orb bg-orb--bottom" />
      <section className="glass-card login-card">
        <p className="eyebrow">Family Hub</p>
        <h1>{needsSetup ? 'Let’s complete your setup' : 'Unlock your household hub'}</h1>
        <p className="subtitle">A calm, mobile-first family command center.</p>
        <div className="profile-grid">
          {activeUsers.map((user) => <button key={user.id} className={`profile-chip ${selectedUser === user.id ? 'is-active' : ''}`} onClick={() => { setSelectedUser(user.id); setPin(''); setError(''); }}>{user.name}</button>)}
        </div>

        {needsSetup ? (
          <button className="btn btn-primary" onClick={() => onStartSetup(selectedUser)}>Start once-off setup</button>
        ) : (
          <>
            <input className="pin-input" type="password" inputMode="numeric" maxLength={4} value={pin} placeholder="••••" onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} />
            {error ? <div className="error-banner">{error}</div> : null}
            <button className="btn btn-primary" disabled={pin.length !== 4} onClick={() => {
              const ok = onUnlock(selectedUser, pin);
              if (!ok) setError('Incorrect PIN.');
              else setPin('');
            }}>Unlock Family Hub</button>
          </>
        )}

        <div className="inactive-users">
          <p className="small-title">Future profiles</p>
          <div className="chip-list">{inactiveUsers.map((user) => <span key={user.id} className="chip chip-muted">{user.name}</span>)}</div>
        </div>
      </section>
    </main>
  );
};
