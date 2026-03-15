import { useMemo, useState } from 'react';
import type { User, UserId } from '../../lib/family-hub/constants';

type Props = {
  users: User[];
  hasPin: (userId: UserId) => boolean;
  isSetupComplete: (userId: UserId) => boolean;
  onUnlock: (userId: UserId, pin: string) => boolean;
  onStartSetup: (userId: UserId) => void;
};

const AVATAR_EMOJI: Record<string, string> = {
  fox: '🦊', cat: '🐱', bear: '🐻', bunny: '🐰'
};

const USER_COLORS: Record<string, string> = {
  johannes: 'profile-chip--blue',
  nicole: 'profile-chip--purple',
  ella: 'profile-chip--rose',
  oliver: 'profile-chip--green'
};

const PAD_KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫'] as const;

export const LoginScreen = ({ users, hasPin, isSetupComplete, onUnlock, onStartSetup }: Props) => {
  const activeUsers = users.filter((user) => user.active);
  const inactiveUsers = users.filter((user) => !user.active);
  const [selectedUser, setSelectedUser] = useState<UserId>(activeUsers[0]?.id ?? 'johannes');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [shaking, setShaking] = useState(false);

  const needsSetup = useMemo(
    () => !hasPin(selectedUser) || !isSetupComplete(selectedUser),
    [hasPin, isSetupComplete, selectedUser]
  );

  const handlePadKey = (key: string) => {
    if (key === '⌫') {
      setPin((p) => p.slice(0, -1));
      setError('');
      return;
    }
    if (pin.length >= 4) return;
    const next = pin + key;
    setPin(next);
    if (next.length === 4) {
      const unlocked = onUnlock(selectedUser, next);
      if (!unlocked) {
        setShaking(true);
        setError('Wrong PIN. Please try again.');
        setTimeout(() => { setPin(''); setShaking(false); }, 600);
      }
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
              }}
            >
              <span className="profile-avatar">👤</span>
              <span className="profile-name">{user.name}</span>
            </button>
          ))}
        </div>

        {inactiveUsers.length > 0 && (
          <div className="future-profiles">
            <p className="future-label">Coming soon</p>
            <div className="future-grid">
              {inactiveUsers.map((user) => (
                <div key={user.id} className="future-chip">
                  <span>👤</span>
                  <span>{user.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {needsSetup ? (
          <button
            data-testid="btn-start-setup"
            className="btn btn-primary"
            onClick={() => onStartSetup(selectedUser)}
          >
            Set up my profile →
          </button>
        ) : (
          <div className={`pin-entry ${shaking ? 'is-shaking' : ''}`}>
            <div className="pin-dots" aria-label="PIN entry">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className={`pin-dot ${pin.length > i ? 'is-filled' : ''}`} />
              ))}
            </div>
            {error ? <p className="error-banner">{error}</p> : null}
            <div className="pin-pad" role="group" aria-label="Number pad">
              {PAD_KEYS.map((key, i) => (
                key === '' ? (
                  <div key={i} />
                ) : (
                  <button
                    key={i}
                    data-testid={`pin-key-${key}`}
                    className={`pin-pad-key ${key === '⌫' ? 'is-back' : ''}`}
                    type="button"
                    onClick={() => handlePadKey(key)}
                    aria-label={key === '⌫' ? 'Delete' : key}
                  >
                    {key}
                  </button>
                )
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
};
