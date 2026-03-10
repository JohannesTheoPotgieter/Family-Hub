import { useState } from 'react';
import type { User } from '../../lib/family-hub/constants';
import { FoundationBlock, RoutePill, ScreenIntro } from './BaselineScaffold';

type Props = {
  activeUser: User | null;
  onChangePin: (currentPin: string, nextPin: string) => boolean;
};

export const MoreScreen = ({ activeUser, onChangePin }: Props) => {
  const [currentPin, setCurrentPin] = useState('');
  const [nextPin, setNextPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [status, setStatus] = useState('');
  const [isError, setIsError] = useState(false);

  return (
    <section className="stack-lg">
      <ScreenIntro
        badge="Settings"
        title="More"
        subtitle="Simple account controls with secure, private access."
      />

      <FoundationBlock title="Users" description="Account details for the active family member.">
        <div className="chip-list">
          <RoutePill label={activeUser ? `Signed in: ${activeUser.name}` : 'No user'} />
          <RoutePill label="PIN protected" />
        </div>
      </FoundationBlock>

      <FoundationBlock title="Change PIN" description="Update your 4-digit unlock PIN any time.">
        <div className="stack-sm">
          <input
            className="pin-input"
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={currentPin}
            placeholder="Current PIN"
            onChange={(event) => setCurrentPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
          />
          <input
            className="pin-input"
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={nextPin}
            placeholder="New PIN"
            onChange={(event) => setNextPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
          />
          <input
            className="pin-input"
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={confirmPin}
            placeholder="Confirm new PIN"
            onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
          />

          {status ? <p className={`status-banner ${isError ? 'is-error' : 'is-success'}`}>{status}</p> : null}

          <button
            className="btn btn-primary"
            disabled={currentPin.length !== 4 || nextPin.length !== 4 || confirmPin.length !== 4}
            onClick={() => {
              if (nextPin !== confirmPin) {
                setIsError(true);
                setStatus('New PIN and confirmation do not match.');
                return;
              }

              const changed = onChangePin(currentPin, nextPin);
              if (!changed) {
                setIsError(true);
                setStatus('Current PIN is incorrect.');
                return;
              }

              setIsError(false);
              setStatus('PIN updated successfully.');
              setCurrentPin('');
              setNextPin('');
              setConfirmPin('');
            }}
          >
            Save new PIN
          </button>
        </div>
      </FoundationBlock>
    </section>
  );
};
