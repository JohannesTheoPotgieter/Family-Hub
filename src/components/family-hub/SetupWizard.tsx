import { useState } from 'react';
import type { User } from '../../lib/family-hub/constants';

type Props = {
  user: User;
  onFinish: (pin: string) => void;
};

export const SetupWizard = ({ user, onFinish }: Props) => {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');

  return (
    <main className="login-shell">
      <div className="bg-orb bg-orb--top" />
      <div className="bg-orb bg-orb--bottom" />
      <section className="glass-card login-card stack">
        <p className="eyebrow">Setup</p>
        <h1>{user.name}, create your Family Hub PIN</h1>
        <p className="muted">Minimal secure setup retained; feature onboarding intentionally deferred to redesign.</p>

        <input
          className="pin-input"
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          placeholder="Create PIN"
          onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
        />
        <input
          className="pin-input"
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={confirmPin}
          placeholder="Confirm PIN"
          onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
        />

        {error ? <p className="error-banner">{error}</p> : null}

        <button
          className="btn btn-primary"
          disabled={pin.length !== 4 || confirmPin.length !== 4}
          onClick={() => {
            if (pin !== confirmPin) {
              setError('PINs do not match.');
              return;
            }
            onFinish(pin);
          }}
        >
          Finish setup
        </button>
      </section>
    </main>
  );
};
