import { useMemo, useState } from 'react';
import type { User, UserId } from '../../lib/family-hub/constants';
import type { AvatarLook, AvatarMood, AvatarProfile } from '../../lib/family-hub/storage';

type AvatarAction = 'feed' | 'dance' | 'ball' | 'adventure';

type Props = {
  users: User[];
  avatars: Record<UserId, AvatarProfile>;
  familyPoints: number;
  onCustomizeAvatar: (userId: UserId, look: AvatarLook) => void;
  onAvatarAction: (userId: UserId, action: AvatarAction) => { mood: AvatarMood; pointsEarned: number; familyPointsEarned: number };
};

const bodyEmoji: Record<AvatarLook['body'], string> = {
  fox: '🦊',
  cat: '🐱',
  bear: '🐻',
  bunny: '🐰'
};

const moodLabel: Record<AvatarMood, string> = {
  happy: 'Happy',
  sleepy: 'Sleepy',
  excited: 'Excited',
  proud: 'Proud',
  silly: 'Silly'
};

const actionLabel: Record<AvatarAction, string> = {
  feed: 'Feed',
  dance: 'Dance',
  ball: 'Play ball',
  adventure: 'Mini adventure'
};

export const AvatarsSection = ({ users, avatars, familyPoints, onCustomizeAvatar, onAvatarAction }: Props) => {
  const [selectedUserId, setSelectedUserId] = useState(users[0]?.id ?? '');
  const [feedback, setFeedback] = useState('');

  const selected = useMemo(() => users.find((user) => user.id === selectedUserId) ?? users[0], [users, selectedUserId]);
  const selectedAvatar = selected ? avatars[selected.id] : null;

  if (!selected || !selectedAvatar) return null;

  return (
    <section className="stack">
      <article className="glass-panel avatar-family-points">
        <p className="eyebrow">Family points</p>
        <h3>{familyPoints} shared points</h3>
        <p className="muted">Everyone contributes together. No rankings, just shared progress.</p>
      </article>

      <article className="glass-panel avatar-selector stack-sm">
        <h3>Family avatars</h3>
        <div className="avatar-row">
          {users.map((user) => (
            <button
              key={user.id}
              className={`avatar-pill avatar-pill-btn ${selected.id === user.id ? 'is-active' : ''}`}
              onClick={() => setSelectedUserId(user.id)}
              type="button"
            >
              <span className="avatar-badge">{bodyEmoji[avatars[user.id].look.body]}</span>
              <span>{user.name}</span>
            </button>
          ))}
        </div>
      </article>

      <article className="glass-panel avatar-detail stack-sm">
        <div className="section-head">
          <h3>{selected.name}'s avatar</h3>
          <span className="route-pill">{moodLabel[selectedAvatar.mood]}</span>
        </div>
        <p className="avatar-preview">{bodyEmoji[selectedAvatar.look.body]}</p>
        <p className="muted">
          {selectedAvatar.points} points · {selectedAvatar.familyContribution} family points contributed
        </p>

        <div className="avatar-custom-grid">
          <label className="task-field">
            Body
            <select
              value={selectedAvatar.look.body}
              onChange={(event) =>
                onCustomizeAvatar(selected.id, { ...selectedAvatar.look, body: event.target.value as AvatarLook['body'] })
              }
            >
              <option value="fox">Fox</option>
              <option value="cat">Cat</option>
              <option value="bear">Bear</option>
              <option value="bunny">Bunny</option>
            </select>
          </label>
          <label className="task-field">
            Outfit
            <select
              value={selectedAvatar.look.outfit}
              onChange={(event) =>
                onCustomizeAvatar(selected.id, { ...selectedAvatar.look, outfit: event.target.value as AvatarLook['outfit'] })
              }
            >
              <option value="cozy">Cozy</option>
              <option value="sporty">Sporty</option>
              <option value="party">Party</option>
              <option value="explorer">Explorer</option>
            </select>
          </label>
          <label className="task-field">
            Accessory
            <select
              value={selectedAvatar.look.accessory}
              onChange={(event) =>
                onCustomizeAvatar(selected.id, {
                  ...selectedAvatar.look,
                  accessory: event.target.value as AvatarLook['accessory']
                })
              }
            >
              <option value="none">None</option>
              <option value="star">Star</option>
              <option value="flower">Flower</option>
              <option value="sunglasses">Sunglasses</option>
            </select>
          </label>
          <label className="task-field">
            Collar
            <select
              value={selectedAvatar.look.collar}
              onChange={(event) =>
                onCustomizeAvatar(selected.id, { ...selectedAvatar.look, collar: event.target.value as AvatarLook['collar'] })
              }
            >
              <option value="blue">Blue</option>
              <option value="mint">Mint</option>
              <option value="pink">Pink</option>
              <option value="gold">Gold</option>
            </select>
          </label>
        </div>

        <div className="quick-actions" role="group" aria-label="Avatar interactions">
          {(Object.keys(actionLabel) as AvatarAction[]).map((action) => (
            <button
              key={action}
              className="chip-action"
              type="button"
              onClick={() => {
                const result = onAvatarAction(selected.id, action);
                setFeedback(
                  `${actionLabel[action]} complete! +${result.pointsEarned} points and +${result.familyPointsEarned} family points.`
                );
              }}
            >
              {actionLabel[action]}
            </button>
          ))}
        </div>

        {feedback ? <p className="status-banner is-success">{feedback}</p> : null}

        <div className="chip-list">
          {selectedAvatar.inventory.map((item) => (
            <span key={item} className="route-pill">
              {item}
            </span>
          ))}
        </div>
      </article>
    </section>
  );
};
