import { formatPoints } from '../../lib/family-hub/format';
import type { FamilyHubState } from '../../lib/family-hub/storage';

type HomeScreenProps = {
  state: FamilyHubState;
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

export const HomeScreen = ({ state }: HomeScreenProps) => {
  const dueSoonCount = getDueSoonCount(state);
  const openTasksCount = getOpenTasksCount(state);
  const tripsSavedCount = getTripsSavedCount(state);
  const currentCompanion = state.activeUserId ? state.avatarGame.companionsByUserId[state.activeUserId] : null;
  const leadChallenge = state.avatarGame.familyChallenges.find((item) => !item.completed) ?? state.avatarGame.familyChallenges[0];

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
          <h3>Family companion energy</h3>
          <span className="crew-points">{formatPoints(state.avatarGame.familyRewardTrack.familyStars)} stars</span>
        </div>
        <div className="avatar-row">
          {state.users.map((user) => (
            <div key={user.id} className={`avatar-pill ${state.activeUserId === user.id ? 'is-active' : ''}`}>
              <span className="avatar-badge">✨</span>
              <span>{user.name}</span>
              <span className="avatar-mini-points">Lv {state.avatarGame.companionsByUserId[user.id].level}</span>
            </div>
          ))}
        </div>
        {currentCompanion ? <p className="status-banner is-success">Your companion feels {currentCompanion.mood} after recent family progress.</p> : null}
      </section>

      {leadChallenge ? (
        <section className="glass-panel stack-sm" aria-label="Family challenge card">
          <p className="eyebrow">Family Challenge</p>
          <h3>{leadChallenge.title}</h3>
          <p className="muted">{leadChallenge.description}</p>
          <progress max={leadChallenge.targetValue} value={leadChallenge.progressValue} aria-label="Family challenge progress" />
          <p className="muted">{leadChallenge.progressValue}/{leadChallenge.targetValue} • {leadChallenge.completed ? 'You completed this week’s family challenge!' : 'The whole household is making progress.'}</p>
        </section>
      ) : null}
    </section>
  );
};
