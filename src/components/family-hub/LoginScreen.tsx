import { useMemo, useState } from 'react';
import type { User, UserId } from '../../lib/family-hub/constants';
import { getRoleLabel } from '../../lib/family-hub/permissions';

type Props = {
  users: User[];
  hasPin: (userId: UserId) => boolean;
  isSetupComplete: (userId: UserId) => boolean;
  onUnlock: (userId: UserId, pin: string) => Promise<boolean>;
  onStartSetup: (userId: UserId) => void;
  onRestartSetup: (userId: UserId) => void;
};

const USER_COLORS: Record<string, string> = {
  johannes: 'profile-chip--blue',
  nicole: 'profile-chip--purple',
  ella: 'profile-chip--rose',
  oliver: 'profile-chip--green'
};

const PAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'] as const;

export const LoginScreen = ({ users, hasPin, isSetupComplete, onUnlock, onStartSetup, onRestartSetup }: Props) => {
  const activeUsers = users.filter((user) => user.active);
  const [selectedUser, setSelectedUser] = useState<UserId>(activeUsers[0]?.id ?? 'johannes');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [shaking, setShaking] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [confirmResetProfile, setConfirmResetProfile] = useState(false);

  const needsSetup = useMemo(
    () => !hasPin(selectedUser) || !isSetupComplete(selectedUser),
    [hasPin, isSetupComplete, selectedUser]
  );

  const handlePadKey = async (key: string) => {
    if (isUnlocking) return;
    if (key === '⌫') {
      setPin((current) => current.slice(0, -1));
      setError('');
      return;
    }
    if (pin.length >= 4) return;
    const next = pin + key;
    setPin(next);
    if (next.length === 4) {
      setIsUnlocking(true);
      const unlocked = await onUnlock(selectedUser, next);
      if (!unlocked) {
        setShaking(true);
        setError('Wrong PIN. Please try again.');
        window.setTimeout(() => {
          setPin('');
          setShaking(false);
          setIsUnlocking(false);
        }, 600);
        return;
      }
      setIsUnlocking(false);
    }
  };

  return (
    <main className="login-shell">
      <div className="bg-orb bg-orb--top" />
      <div className="bg-orb bg-orb--bottom" />

      <section className="glass-card login-card stack">
        <div className="login-brand">
          <span className="login-logo">🏡</span>
          <p className="eyebrow">Family Hub</p>
        </div>
        <h1>Welcome home</h1>
        <p className="muted">Choose your profile to continue.</p>

        <div className="profile-grid">
          {activeUsers.map((user) => (
            <button
              key={user.id}
              data-testid={`profile-chip-${user.id}`}
              className={`profile-chip ${USER_COLORS[user.id] ?? ''} ${selectedUser === user.id ? 'is-active' : ''}`}
              onClick={() => {
                setSelectedUser(user.id);
                setPin('');
                setError('');
                setIsUnlocking(false);
                setConfirmResetProfile(false);
              }}
              type="button"
            >
              <span className="profile-avatar">👤</span>
              <span className="profile-name">{user.name}</span>
            </button>
          ))}
        </div>

        <div className="future-profiles">
          <p className="future-label">Household access</p>
          <div className="future-grid">
            {activeUsers.map((user) => (
              <div key={user.id} className="future-chip">
                <span>👤</span>
                <span>{user.name} · {getRoleLabel(user)}</span>
              </div>
            ))}
          </div>
        </div>

        {needsSetup ? (
          <button
            data-testid="btn-start-setup"
            className="btn btn-primary"
            onClick={() => onStartSetup(selectedUser)}
            type="button"
          >
            Set up my profile →
          </button>
        ) : (
          <div className={`pin-entry ${shaking ? 'is-shaking' : ''}`}>
            <div className="pin-dots" aria-label="PIN entry">
              {[0, 1, 2, 3].map((index) => (
                <div key={index} className={`pin-dot ${pin.length > index ? 'is-filled' : ''}`} />
              ))}
            </div>
            {error ? <p className="error-banner">{error}</p> : null}
            {isUnlocking ? <p className="muted">Unlocking your profile…</p> : null}
            <div className="pin-pad" role="group" aria-label="Number pad">
              {PAD_KEYS.map((key, index) => (
                key === '' ? (
                  <div key={index} />
                ) : (
                  <button
                    key={index}
                    data-testid={`pin-key-${key}`}
                    className={`pin-pad-key ${key === '⌫' ? 'is-back' : ''}`}
                    type="button"
                    onClick={() => void handlePadKey(key)}
                    aria-label={key === '⌫' ? 'Delete' : key}
                    disabled={isUnlocking}
                  >
                    {key}
                  </button>
                )
              ))}
            </div>
            {!confirmResetProfile ? (
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => {
                  setConfirmResetProfile(true);
                  setError('');
                }}
                disabled={isUnlocking}
              >
                I forgot my PIN
              </button>
            ) : (
              <div className="stack-sm">
                <p className="error-banner">
                  This clears {users.find((user) => user.id === selectedUser)?.name}&apos;s saved PIN and setup data on this device so you can start again.
                </p>
                <div className="task-composer-actions">
                  <button className="btn btn-ghost" type="button" onClick={() => setConfirmResetProfile(false)}>
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => {
                      onRestartSetup(selectedUser);
                      setConfirmResetProfile(false);
                      setPin('');
                    }}
                  >
                    Reset and restart setup
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
};
