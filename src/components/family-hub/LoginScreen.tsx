import { useMemo, useState } from 'react';
import type { User, UserId } from '../../lib/family-hub/constants';

type Props = {
  users: User[];
  hasPin: (userId: UserId) => boolean;
  onUnlock: (userId: UserId, pin: string) => boolean;
  onCreatePin: (userId: UserId, pin: string) => void;
};

export const LoginScreen = ({ users, hasPin, onUnlock, onCreatePin }: Props) => {
  const activeUsers = users.filter((u) => u.active);
  const inactiveUsers = users.filter((u) => !u.active);
  const [selectedUser, setSelectedUser] = useState<UserId>(activeUsers[0]?.id ?? users[0]?.id ?? 'johannes');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');

  const needsSetup = useMemo(() => !hasPin(selectedUser), [hasPin, selectedUser]);

  const submit = () => {
    if (!selectedUser) {
      setError('No active profile is available yet.');
      return;
    }

    if (needsSetup) {
      if (pin.length !== 4 || confirmPin.length !== 4) return;
      if (pin !== confirmPin) {
        setError('PIN confirmation does not match.');
        return;
      }
      onCreatePin(selectedUser, pin);
      setPin('');
      setConfirmPin('');
      setError('');
      return;
    }

    const ok = onUnlock(selectedUser, pin);
    if (!ok) {
      setError('Invalid PIN. Try again.');
      return;
    }
    setPin('');
    setConfirmPin('');
    setError('');
  };

  return (
    <main className="login-shell">
      <div className="bg-orb bg-orb--top" />
      <div className="bg-orb bg-orb--bottom" />
      <section className="glass-card login-card">
        <p className="eyebrow">Family Hub</p>
        <h1>{needsSetup ? 'Create your secure PIN' : 'Welcome back'}</h1>
        <p className="subtitle">A premium shared space for your family plans, tasks, and money.</p>

        <div className="profile-grid">
          {(activeUsers.length ? activeUsers : users).map((user) => (
            <button
              key={user.id}
              className={`profile-chip ${selectedUser === user.id ? 'is-active' : ''}`}
              onClick={() => {
                setSelectedUser(user.id);
                setPin('');
                setConfirmPin('');
                setError('');
              }}
            >
              {user.name}
            </button>
          ))}
        </div>

        <label className="field-label">{needsSetup ? 'Create 4-digit PIN' : '4-digit PIN'}</label>
        <input
          className="pin-input"
          type="password"
          inputMode="numeric"
          value={pin}
          maxLength={4}
          placeholder="••••"
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
        />

        {needsSetup ? (
          <>
            <label className="field-label">Confirm PIN</label>
            <input
              className="pin-input"
              type="password"
              inputMode="numeric"
              value={confirmPin}
              maxLength={4}
              placeholder="••••"
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
          </>
        ) : null}

        {error ? <div className="error-banner">{error}</div> : null}

        <button
          className="btn btn-primary"
          onClick={submit}
          disabled={needsSetup ? pin.length !== 4 || confirmPin.length !== 4 : pin.length !== 4}
        >
          {needsSetup ? 'Create PIN and continue' : 'Unlock Family Hub'}
        </button>

        <div className="inactive-users">
          <p className="small-title">Future profiles</p>
          <div className="chip-list">
            {inactiveUsers.map((user) => (
              <span key={user.id} className="chip chip-muted">
                {user.name}
              </span>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
};
