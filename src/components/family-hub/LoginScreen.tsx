import { useState } from 'react';
import type { User, UserId } from '../../lib/family-hub/constants';

type Props = {
  users: User[];
  hasPin: (userId: UserId) => boolean;
  isSetupComplete: (userId: UserId) => boolean;
  onUnlock: (userId: UserId, pin: string) => boolean;
  onStartSetup: (userId: UserId) => void;
};

export const LoginScreen = ({ users, hasPin, isSetupComplete, onUnlock, onStartSetup }: Props) => {
  const activeUsers = users.filter((user) => user.active);
  const inactiveUsers = users.filter((user) => !user.active);
  const [selectedUser, setSelectedUser] = useState<UserId>(activeUsers[0]?.id ?? 'johannes');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const needsSetup = useMemo(
    () => !hasPin(selectedUser) || !isSetupComplete(selectedUser),
    [hasPin, isSetupComplete, selectedUser]
  );

  return (
    <main className="login-shell">
      <div className="bg-orb bg-orb--top" />
      <div className="bg-orb bg-orb--bottom" />

      <section className="glass-card login-card stack">
        <p className="eyebrow">Welcome to Family Hub</p>
        <h1>Pick your profile and unlock your family home.</h1>
        <p className="muted">Warm, private and designed for quick everyday check-ins.</p>

        <div className="profile-grid">
          {activeUsers.map((user) => (
            <button
              key={user.id}
              className={`profile-chip ${selectedUser === user.id ? 'is-active' : ''}`}
              onClick={() => {
                setSelectedUser(user.id);
                setPin('');
                setError('');
              }}
            >
              <span className="profile-name">{user.name}</span>
              <span className="profile-meta">Active</span>
            </button>
          ))}
        </div>

        <div className="future-profiles">
          <p className="future-label">Future profiles</p>
          <div className="future-grid">
            {inactiveUsers.map((user) => (
              <div key={user.id} className="future-chip" aria-label={`${user.name} future profile`}>
                {user.name}
              </div>
            ))}
          </div>
        </div>

        {needsSetup ? (
          <button className="btn btn-primary" onClick={() => onStartSetup(selectedUser)}>
            Start first-time setup
          </button>
        ) : (
          <>
            <input
              className="pin-input"
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              placeholder="Enter PIN"
              onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
            />
            {error ? <p className="error-banner">{error}</p> : null}
            <button
              className="btn btn-primary"
              disabled={pin.length !== 4}
              onClick={() => {
                const unlocked = onUnlock(selectedUser, pin);
                if (!unlocked) {
                  setError('That PIN was not correct. Please try again.');
                  return;
                }
                setPin('');
              }}
            >
              Unlock Family Hub
            </button>
          </>
        )}
      </section>
    </main>
  );
};
