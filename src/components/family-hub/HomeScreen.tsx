import { useState } from 'react';
import type { UserId } from '../../lib/family-hub/constants';
import type { FamilyHubState } from '../../lib/family-hub/storage';
import { getTodayIso } from '../../lib/family-hub/date';

type CareAction = 'feed' | 'play' | 'clean' | 'rest' | 'pet' | 'story';

type HomeScreenProps = {
  state: FamilyHubState;
  onCareAction: (userId: UserId, action: CareAction) => void;
  onLock: () => void;
};

const moodEmoji: Record<string, string> = {
  happy: '🙂',
  sleepy: '😴',
  playful: '🤸',
  proud: '😎',
  hungry: '🍎',
  sad: '🥺',
  curious: '🧭',
  calm: '🌿',
  sparkly: '✨'
};

const speciesEmoji: Record<string, string> = {
  foxling: '🦊',
  mooncat: '🐱',
  cloudbear: '🐻',
  bunny: '🐰'
};

const careLabels: Record<CareAction, string> = {
  feed: 'Feed',
  play: 'Play',
  clean: 'Freshen up',
  rest: 'Rest',
  pet: 'Pet',
  story: 'Story time'
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
  const todayIso = getTodayIso();
  const endDate = new Date(`${todayIso}T12:00:00`);
  endDate.setDate(endDate.getDate() + 7);
  const endIso = endDate.toISOString().slice(0, 10);
  return state.money.bills.filter((bill) => !bill.paid && bill.dueDateIso >= todayIso && bill.dueDateIso <= endIso).length;
};

const getOpenTasksCount = (state: FamilyHubState) => state.tasks.items.filter((task) => !task.completed).length;

const getUpcomingEvents = (state: FamilyHubState) => {
  const todayIso = getTodayIso();
  return state.calendar.events
    .filter((event) => event.date >= todayIso)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);
};

const getOverduePayments = (state: FamilyHubState) => {
  const todayIso = getTodayIso();
  return state.money.bills.filter((bill) => !bill.paid && bill.dueDateIso < todayIso).length;
};

export const HomeScreen = ({ state, onCareAction, onLock }: HomeScreenProps) => {
  const dueSoonCount = getDueSoonCount(state);
  const openTasksCount = getOpenTasksCount(state);
  const overdueCount = getOverduePayments(state);
  const upcomingEvents = getUpcomingEvents(state);
  const [reaction, setReaction] = useState('');

  const activeUser = state.users.find((user) => user.id === state.activeUserId) ?? null;
  const activeCompanion = state.activeUserId ? state.avatarGame.companionsByUserId[state.activeUserId] : null;
  const familyTrack = state.avatarGame.familyRewardTrack;

  return (
    <section className="home-screen stack-lg">
      <header className="glass-panel today-hero">
        <div className="today-hero-top">
          {activeCompanion ? (
            <span className="today-avatar-badge">
              {speciesEmoji[activeCompanion.species] ?? '🐾'} {moodEmoji[activeCompanion.mood] ?? '✨'}
            </span>
          ) : null}
          <button className="btn btn-ghost" type="button" onClick={onLock}>
            Switch profile
          </button>
        </div>
        <p className="eyebrow">{getTodayLabel()}</p>
        <h2>{getGreeting()}{activeUser ? `, ${activeUser.name}` : ''}</h2>
        <p className="muted">Here&apos;s what needs care across your home today.</p>
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
            <h3>Coming up</h3>
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
          <span className="crew-points">{familyTrack.familyStars} stars</span>
        </div>
        <div className="avatar-row">
          {state.users.map((user) => {
            const companion = state.avatarGame.companionsByUserId[user.id];
            return (
              <div
                key={user.id}
                className={`avatar-pill ${state.activeUserId === user.id ? 'is-active' : ''} ${!user.active ? 'is-inactive-user' : ''}`}
              >
                <span className="avatar-badge">{speciesEmoji[companion.species] ?? '🐾'}</span>
                <div className="avatar-pill-info">
                  <span className="avatar-pill-name">{user.name}</span>
                  <span className="avatar-mini-points">Lv {companion.level} · {companion.mood}</span>
                </div>
              </div>
            );
          })}
        </div>

        {state.activeUserId && activeCompanion ? (
          <>
            <div className="quick-actions" role="group" aria-label="Quick companion care actions">
              {(['feed', 'play', 'rest', 'story'] as const).map((action) => (
                <button
                  key={action}
                  className="chip-action"
                  data-testid={`btn-avatar-${action}`}
                  type="button"
                  onClick={() => {
                    onCareAction(state.activeUserId as UserId, action);
                    setReaction(`${careLabels[action]} done for ${activeCompanion.name}.`);
                  }}
                >
                  {careLabels[action]}
                </button>
              ))}
            </div>
            {reaction ? <p className="status-banner is-success">{reaction}</p> : null}
            <p className="muted">
              {activeCompanion.name} is level {activeCompanion.level} with {activeCompanion.coins} coins and {activeCompanion.stars} stars.
            </p>
          </>
        ) : null}
      </section>
    </section>
  );
};
