import { useState } from 'react';
import { formatPoints } from '../../lib/family-hub/format';
import type { UserId } from '../../lib/family-hub/constants';
import type { FamilyHubState } from '../../lib/family-hub/storage';

type AvatarAction = 'feed' | 'dance' | 'ball' | 'adventure';

type HomeScreenProps = {
  state: FamilyHubState;
  onAvatarAction: (userId: UserId, action: AvatarAction) => { pointsEarned: number; familyPointsEarned: number };
};

const getTodayLabel = () =>
  new Intl.DateTimeFormat('en-ZA', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  }).format(new Date());

const getDueSoonCount = (state: FamilyHubState) => {
  const now = new Date();
  const inSevenDays = new Date(now);
  inSevenDays.setDate(now.getDate() + 7);

  return state.money.bills.filter((payment) => {
    if (payment.paid) return false;
    const due = new Date(payment.dueDateIso);
    return due >= now && due <= inSevenDays;
  }).length;
};

const getOpenTasksCount = (state: FamilyHubState) => state.tasks.items.filter((task) => !task.completed).length;

const getTripsSavedCount = (state: FamilyHubState) =>
  state.calendar.events.filter((event) => /trip|travel|getaway|flight|vacation/i.test(event.title)).length;

export const HomeScreen = ({ state, onAvatarAction }: HomeScreenProps) => {
  const dueSoonCount = getDueSoonCount(state);
  const openTasksCount = getOpenTasksCount(state);
  const tripsSavedCount = getTripsSavedCount(state);
  const [reaction, setReaction] = useState('');

  return (
    <section className="home-screen stack-lg">
      <header className="glass-panel today-hero">
        <div className="stack-sm">
          <p className="eyebrow">Good to see everyone</p>
          <h2>Today in your Family Command Center</h2>
          <p className="muted">{getTodayLabel()} · Bright skies ahead. Perfect for finishing one key thing together.</p>
        </div>
      </header>

      <section className="metric-row" aria-label="Key metrics">
        <article className="glass-panel metric-card">
          <p className="metric-label">Payments due</p>
          <p className="metric-value">{dueSoonCount}</p>
        </article>
        <article className="glass-panel metric-card">
          <p className="metric-label">Open tasks</p>
          <p className="metric-value">{openTasksCount}</p>
        </article>
        <article className="glass-panel metric-card">
          <p className="metric-label">Trips saved</p>
          <p className="metric-value">{tripsSavedCount}</p>
        </article>
      </section>

      <section className="glass-panel crew-strip stack-sm" aria-label="Family avatars">
        <div className="crew-header">
          <h3>Avatar strip</h3>
          <span className="crew-points">{formatPoints(state.familyPoints)}</span>
        </div>
        <div className="avatar-row">
          {state.users.map((user) => (
            <div key={user.id} className={`avatar-pill ${state.activeUserId === user.id ? 'is-active' : ''}`}>
              <span className="avatar-badge">{state.avatars[user.id].look.body === 'fox' ? '🦊' : state.avatars[user.id].look.body === 'cat' ? '🐱' : state.avatars[user.id].look.body === 'bear' ? '🐻' : '🐰'}</span>
              <span>{user.name}</span>
              <span className="avatar-mini-points">{state.avatars[user.id].points}</span>
            </div>
          ))}
        </div>

        {state.activeUserId ? (
          <div className="quick-actions" role="group" aria-label="Quick avatar actions">
            <button
              className="chip-action"
              type="button"
              onClick={() => {
                const result = onAvatarAction(state.activeUserId as UserId, 'feed');
                setReaction(`Snack time! +${result.pointsEarned} points`);
              }}
            >
              Feed
            </button>
            <button
              className="chip-action"
              type="button"
              onClick={() => {
                const result = onAvatarAction(state.activeUserId as UserId, 'dance');
                setReaction(`Dance burst! +${result.pointsEarned} points`);
              }}
            >
              Dance
            </button>
            <button
              className="chip-action"
              type="button"
              onClick={() => {
                const result = onAvatarAction(state.activeUserId as UserId, 'ball');
                setReaction(`Ball play unlocked! +${result.pointsEarned} points`);
              }}
            >
              Play ball
            </button>
            <button
              className="chip-action"
              type="button"
              onClick={() => {
                const result = onAvatarAction(state.activeUserId as UserId, 'adventure');
                setReaction(`Mini adventure done! +${result.pointsEarned} points`);
              }}
            >
              Adventure
            </button>
          </div>
        ) : null}

        {reaction ? <p className="status-banner is-success">{reaction}</p> : null}
      </section>
    </section>
  );
};
