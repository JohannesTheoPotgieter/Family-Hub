import { useState } from 'react';
import type { User, UserId } from '../../lib/family-hub/constants';
import type { AvatarLook, AvatarMood, AvatarProfile } from '../../lib/family-hub/storage';
import { FoundationBlock, RoutePill, ScreenIntro } from './BaselineScaffold';
import { AvatarsSection } from './AvatarsSection';

type AvatarAction = 'feed' | 'dance' | 'ball' | 'adventure';

type Props = {
  users: User[];
  avatars: Record<UserId, AvatarProfile>;
  familyPoints: number;
  activeUser: User | null;
  onChangePin: (currentPin: string, nextPin: string) => boolean;
  onCustomizeAvatar: (userId: UserId, look: AvatarLook) => void;
  onAvatarAction: (userId: UserId, action: AvatarAction) => { mood: AvatarMood; pointsEarned: number; familyPointsEarned: number };
};

export const MoreScreen = ({ users, avatars, familyPoints, activeUser, onChangePin, onCustomizeAvatar, onAvatarAction }: Props) => {
  const [currentPin, setCurrentPin] = useState('');
  const [nextPin, setNextPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [status, setStatus] = useState('');
  const [isError, setIsError] = useState(false);
  const [section, setSection] = useState<'settings' | 'avatars'>('settings');

  return (
    <section className="stack-lg">
      <ScreenIntro badge="Settings" title="More" subtitle="Family controls and your playful avatar space." />

      <div className="quick-actions">
        <button className={`chip-action ${section === 'settings' ? 'is-selected' : ''}`} onClick={() => setSection('settings')} type="button">Settings</button>
        <button className={`chip-action ${section === 'avatars' ? 'is-selected' : ''}`} onClick={() => setSection('avatars')} type="button">Avatars</button>
      </div>

      {section === 'avatars' ? (
        <AvatarsSection
          users={users}
          avatars={avatars}
          familyPoints={familyPoints}
          onCustomizeAvatar={onCustomizeAvatar}
          onAvatarAction={onAvatarAction}
        />
      ) : (
        <>
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
        </>
      )}
    </section>
  );
};
