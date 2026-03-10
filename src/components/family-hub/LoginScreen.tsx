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
  const activeUsers = users.filter((user) => user.active);
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
        <p className="eyebrow">Family Hub</p>
        <h1>{needsSetup ? 'Set up your profile to continue' : 'Unlock your household hub'}</h1>
        <p className="muted">Secure local entry point with a redesign-ready glass baseline.</p>

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
              {user.name}
            </button>
          ))}
        </div>

        {needsSetup ? (
          <button className="btn btn-primary" onClick={() => onStartSetup(selectedUser)}>
            Start setup
          </button>
        ) : (
          <>
            <input
              className="pin-input"
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              placeholder="••••"
              onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
            />
            {error ? <p className="error-banner">{error}</p> : null}
            <button
              className="btn btn-primary"
              disabled={pin.length !== 4}
              onClick={() => {
                const unlocked = onUnlock(selectedUser, pin);
                if (!unlocked) {
                  setError('Incorrect PIN.');
                  return;
                }
                setPin('');
              }}
            >
              Unlock
            </button>
          </>
        )}
      </section>
    </main>
  );
};
