import { useState } from 'react';
import { formatPoints } from '../../lib/family-hub/format';
import type { UserId } from '../../lib/family-hub/constants';
import type { FamilyHubState } from '../../lib/family-hub/storage';

type AvatarAction = 'feed' | 'dance' | 'ball' | 'adventure';

type HomeScreenProps = {
  state: FamilyHubState;
  onAvatarAction: (userId: UserId, action: AvatarAction) => { pointsEarned: number; familyPointsEarned: number };
};

const BODY_EMOJI: Record<string, string> = {
  fox: '🦊', cat: '🐱', bear: '🐻', bunny: '🐰'
};

const MOOD_EMOJI: Record<string, string> = {
  happy: '😊', sleepy: '😴', excited: '🤩', proud: '😎', silly: '😜'
};

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

const getTodayLabel = () =>
  new Intl.DateTimeFormat('en-ZA', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());

const getDueSoonCount = (state: FamilyHubState) => {
  const now = new Date();
  const inSevenDays = new Date(now);
  inSevenDays.setDate(now.getDate() + 7);
  return state.money.payments.filter((p) => {
    if (p.paid) return false;
    const due = new Date(p.dueDate);
    return due >= now && due <= inSevenDays;
  }).length;
};

const getOpenTasksCount = (state: FamilyHubState) =>
  state.tasks.items.filter((t) => !t.completed).length;

const getUpcomingEvents = (state: FamilyHubState) => {
  const today = new Date().toISOString().slice(0, 10);
  return state.calendar.events
    .filter((e) => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);
};

const getOverduePayments = (state: FamilyHubState) => {
  const today = new Date().toISOString().slice(0, 10);
  return state.money.payments.filter((p) => !p.paid && p.dueDate < today).length;
};

export const HomeScreen = ({ state, onAvatarAction }: HomeScreenProps) => {
  const dueSoonCount = getDueSoonCount(state);
  const openTasksCount = getOpenTasksCount(state);
  const overdueCount = getOverduePayments(state);
  const upcomingEvents = getUpcomingEvents(state);
  const [reaction, setReaction] = useState('');

  const activeUser = state.users.find((u) => u.id === state.activeUserId);
  const activeAvatar = state.activeUserId ? state.avatars[state.activeUserId] : null;

  return (
    <section className="home-screen stack-lg">
      <header className="glass-panel today-hero">
        <div className="today-hero-top">
          {activeAvatar && (
            <span className="today-avatar-badge">
              {BODY_EMOJI[activeAvatar.look.body]} {MOOD_EMOJI[activeAvatar.mood]}
            </span>
          )}
        </div>
        <p className="eyebrow">{getTodayLabel()}</p>
        <h2>{getGreeting()}{activeUser ? `, ${activeUser.name}` : ''}</h2>
        <p className="muted">Here's what's on for your family today.</p>
      </header>

      <section className="metric-row-3" aria-label="Key metrics">
        <article className="glass-panel metric-card" data-testid="metric-open-tasks">
          <p className="metric-label">Open tasks</p>
          <p className="metric-value">{openTasksCount}</p>
        </article>
        <article className={`glass-panel metric-card ${dueSoonCount > 0 ? 'metric-card--warn' : ''}`} data-testid="metric-payments-due">
          <p className="metric-label">Due soon</p>
          <p className="metric-value">{dueSoonCount}</p>
        </article>
        <article className={`glass-panel metric-card ${overdueCount > 0 ? 'metric-card--danger' : ''}`} data-testid="metric-overdue">
          <p className="metric-label">Overdue</p>
          <p className="metric-value">{overdueCount}</p>
        </article>
      </section>

      {upcomingEvents.length > 0 && (
        <section className="glass-panel home-events-panel" aria-label="Upcoming events">
          <div className="section-head">
            <h3>📅 Coming up</h3>
          </div>
          <div className="home-events-list">
            {upcomingEvents.map((event) => (
              <div key={event.id} className="home-event-item">
                <span className={`event-kind-dot is-${event.kind ?? 'event'}`} />
                <div>
                  <p className="home-event-title">{event.title}</p>
                  <p className="home-event-date muted">
                    {new Intl.DateTimeFormat('en-ZA', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${event.date}T12:00:00`))}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="glass-panel crew-strip stack-sm" aria-label="Family crew">
        <div className="crew-header">
          <h3>Your crew</h3>
          <span className="crew-points">{formatPoints(state.familyPoints)}</span>
        </div>
        <div className="avatar-row">
          {state.users.map((user) => {
            const av = state.avatars[user.id];
            return (
              <div
                key={user.id}
                className={`avatar-pill ${state.activeUserId === user.id ? 'is-active' : ''} ${!user.active ? 'is-inactive-user' : ''}`}
              >
                <span className="avatar-badge">{BODY_EMOJI[av.look.body]}</span>
                <div className="avatar-pill-info">
                  <span className="avatar-pill-name">{user.name}</span>
                  <span className="avatar-mini-points">{av.points} pts</span>
                </div>
              </div>
            );
          })}
        </div>

        {state.activeUserId ? (
          <>
            <div className="quick-actions" role="group" aria-label="Quick avatar actions">
              {(['feed', 'dance', 'ball', 'adventure'] as const).map((action) => {
                const labels: Record<typeof action, string> = {
                  feed: '🍎 Feed', dance: '💃 Dance', ball: '⚽ Play', adventure: '🗺 Explore'
                };
                return (
                  <button
                    key={action}
                    className="chip-action"
                    data-testid={`btn-avatar-${action}`}
                    type="button"
                    onClick={() => {
                      const result = onAvatarAction(state.activeUserId as UserId, action);
                      const msgs: Record<typeof action, string> = {
                        feed: `Snack time! +${result.pointsEarned} pts`,
                        dance: `Dance burst! +${result.pointsEarned} pts`,
                        ball: `Ball play! +${result.pointsEarned} pts`,
                        adventure: `Adventure done! +${result.pointsEarned} pts`
                      };
                      setReaction(msgs[action]);
                    }}
                  >
                    {labels[action]}
                  </button>
                );
              })}
            </div>
            {reaction && <p className="status-banner is-success">{reaction}</p>}
          </>
        ) : null}
      </section>
    </section>
  );
};
