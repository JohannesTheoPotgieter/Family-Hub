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

  return state.money.payments.filter((payment) => {
    if (payment.paid) return false;
    const due = new Date(payment.dueDate);
    return due >= now && due <= inSevenDays;
  }).length;
};

const getOpenTasksCount = (state: FamilyHubState) => state.tasks.items.filter((task) => !task.completed).length;

const getTripsSavedCount = (state: FamilyHubState) =>
  state.calendar.events.filter((event) => /trip|travel|getaway|flight|vacation/i.test(event.title)).length;

const getUrgentItems = (state: FamilyHubState) => {
  const urgentPayments = state.money.payments
    .filter((payment) => !payment.paid)
    .slice(0, 2)
    .map((payment) => ({ id: payment.id, label: `${payment.title} due ${payment.dueDate}`, kind: 'payment' as const }));

  const urgentTasks = state.tasks.items
    .filter((task) => !task.completed)
    .slice(0, 2)
    .map((task) => ({ id: task.id, label: task.title, kind: 'task' as const }));

  return [...urgentPayments, ...urgentTasks].slice(0, 4);
};

const getUpcomingItems = (state: FamilyHubState) =>
  [...state.calendar.events]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3)
    .map((event) => ({ id: event.id, label: event.title, date: event.date }));

export const HomeScreen = ({ state }: HomeScreenProps) => {
  const dueSoonCount = getDueSoonCount(state);
  const openTasksCount = getOpenTasksCount(state);
  const tripsSavedCount = getTripsSavedCount(state);
  const urgentItems = getUrgentItems(state);
  const upcomingItems = getUpcomingItems(state);
  const activeProfiles = Object.values(state.userSetupProfiles);
  const familyPoints = activeProfiles.length
    ? activeProfiles.reduce((acc, profile) => acc + profile.budgetCategories.length * 40 + profile.recurringPayments.length * 25, 0)
    : null;
  const noData =
    state.tasks.items.length === 0 &&
    state.money.payments.length === 0 &&
    state.calendar.events.length === 0 &&
    activeProfiles.length === 0;

  return (
    <section className="home-screen stack-lg">
      <header className="glass-panel today-hero">
        <div className="stack-sm">
          <p className="eyebrow">Good to see everyone</p>
          <h2>Today in your Family Command Center</h2>
          <p className="muted">{getTodayLabel()} · Bright skies ahead. Perfect for finishing one key thing together.</p>
        </div>
        <div className="quick-actions" role="group" aria-label="Quick actions">
          <button className="chip-action" type="button">+ Payment</button>
          <button className="chip-action" type="button">+ Task</button>
          <button className="chip-action" type="button">+ Place</button>
          <button className="chip-action" type="button">Plan outing</button>
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

      <section className="glass-panel crew-strip stack-sm" aria-label="Family crew">
        <div className="crew-header">
          <h3>Family crew</h3>
          {familyPoints !== null ? <span className="crew-points">{formatPoints(familyPoints)}</span> : null}
        </div>
        <div className="avatar-row">
          {state.users.map((user) => (
            <div key={user.id} className={`avatar-pill ${state.activeUserId === user.id ? 'is-active' : ''}`}>
              <span className="avatar-badge">{user.name.slice(0, 1)}</span>
              <span>{user.name}</span>
            </div>
          ))}
        </div>
      </section>

      {noData ? (
        <section className="glass-panel empty-home stack" aria-label="Start your home hub">
          <h3>Start your family home in under 2 minutes</h3>
          <p className="muted">Add one item from each area and this screen will become your daily command center.</p>
          <div className="empty-actions">
            <button className="btn btn-ghost" type="button">Add first payment</button>
            <button className="btn btn-ghost" type="button">Add first task</button>
            <button className="btn btn-ghost" type="button">Add first place</button>
            <button className="btn btn-primary" type="button">Create first budget</button>
          </div>
        </section>
      ) : (
        <>
          <section className="glass-panel stack" aria-label="Urgent section">
            <div className="section-head">
              <h3>Urgent</h3>
              <span className="section-tip">Do these first</span>
            </div>
            <div className="stack-sm">
              {urgentItems.length ? (
                urgentItems.map((item) => (
                  <article key={item.id} className="list-item">
                    <span className={`item-tag ${item.kind === 'payment' ? 'is-warn' : 'is-task'}`}>{item.kind}</span>
                    <p>{item.label}</p>
                  </article>
                ))
              ) : (
                <p className="muted">No urgent items. Enjoy the breathing room ✨</p>
              )}
            </div>
          </section>

          <section className="glass-panel stack" aria-label="Coming up section">
            <div className="section-head">
              <h3>Coming up</h3>
              <span className="section-tip">Next 3 events</span>
            </div>
            <div className="stack-sm">
              {upcomingItems.length ? (
                upcomingItems.map((item) => (
                  <article key={item.id} className="list-item">
                    <span className="item-tag is-soft">{item.date}</span>
                    <p>{item.label}</p>
                  </article>
                ))
              ) : (
                <p className="muted">No events added yet. Add one to set the rhythm.</p>
              )}
            </div>
          </section>

          <section className="glass-panel stack" aria-label="Places preview section">
            <div className="section-head">
              <h3>Places preview</h3>
              <span className="section-tip">Family favorites</span>
            </div>
            <div className="chip-list">
              {activeProfiles[0]?.avatarName ? <span className="route-pill">{activeProfiles[0].avatarName}'s pick</span> : null}
              <span className="route-pill">School</span>
              <span className="route-pill">Work</span>
              <span className="route-pill">Grocery</span>
            </div>
          </section>

          <section className="glass-panel stack" aria-label="My tasks preview">
            <div className="section-head">
              <h3>My tasks preview</h3>
              <span className="section-tip">Keep momentum</span>
            </div>
            <div className="chip-list">
              {state.tasks.items.slice(0, 4).map((task) => (
                <span key={task.id} className={`route-pill ${task.completed ? 'is-complete' : ''}`}>
                  {task.title}
                </span>
              ))}
            </div>
          </section>
        </>
      )}
    </section>
  );
};
