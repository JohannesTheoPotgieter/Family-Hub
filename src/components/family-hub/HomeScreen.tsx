import { useMemo, useState } from 'react';
import type { UserId } from '../../lib/family-hub/constants';
import type { Bill, FamilyHubState, TaskItem } from '../../lib/family-hub/storage';
import { formatCurrencyZAR, getMonthIncomeTotal, getMonthSpendingTotal, getNetBalance, getSafeToSpend } from '../../lib/family-hub/money';
import { getTodayIso } from '../../lib/family-hub/date';
import { buildHomeInsights } from '../../lib/family-hub/homeInsights';

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

const calendarSourceLabel: Record<string, string> = {
  internal: 'Family Hub',
  google: 'Google',
  microsoft: 'Outlook',
  ics: 'ICS'
};

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

const getTodayLabel = () =>
  new Intl.DateTimeFormat('en-ZA', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());

const getDueSoonBills = (state: FamilyHubState) => {
  const todayIso = getTodayIso();
  const endDate = new Date(`${todayIso}T12:00:00`);
  endDate.setDate(endDate.getDate() + 7);
  const endIso = endDate.toISOString().slice(0, 10);
  return state.money.bills.filter((bill) => !bill.paid && bill.dueDateIso >= todayIso && bill.dueDateIso <= endIso);
};

const getOpenTasks = (state: FamilyHubState) => state.tasks.items.filter((task) => !task.completed);

const getUpcomingEvents = (state: FamilyHubState) => {
  const todayStart = new Date(`${getTodayIso()}T00:00:00`);
  const internal = state.calendar.events.map((event) => ({
    id: `internal-${event.id}`,
    title: event.title,
    iso: `${event.date}T12:00:00.000Z`,
    kind: event.kind ?? 'event',
    sourceLabel: calendarSourceLabel.internal
  }));
  const external = state.calendar.externalEvents.map((event) => ({
    id: `${event.provider}-${event.id}`,
    title: event.title,
    iso: event.start.iso,
    kind: event.start.allDay ? 'event' : 'appointment',
    sourceLabel: calendarSourceLabel[event.provider] ?? 'Calendar'
  }));

  return [...internal, ...external]
    .filter((event) => new Date(event.iso) >= todayStart)
    .sort((a, b) => a.iso.localeCompare(b.iso))
    .slice(0, 4);
};

const getOverduePayments = (state: FamilyHubState) => {
  const todayIso = getTodayIso();
  return state.money.bills.filter((bill) => !bill.paid && bill.dueDateIso < todayIso);
};

const getPriorityTone = (overdueBills: Bill[], openTasks: TaskItem[]) => {
  if (overdueBills.length > 0) return 'urgent';
  if (openTasks.length > 4) return 'busy';
  return 'steady';
};

export const HomeScreen = ({ state, onCareAction, onLock }: HomeScreenProps) => {
  const [reaction, setReaction] = useState('');
  const todayIso = getTodayIso();
  const monthKey = todayIso.slice(0, 7);

  const activeUser = state.users.find((user) => user.id === state.activeUserId) ?? null;
  const activeCompanion = state.activeUserId ? state.avatarGame.companionsByUserId[state.activeUserId] : null;
  const familyTrack = state.avatarGame.familyRewardTrack;
  const insights = buildHomeInsights(state, activeUser);

  const dueSoonBills = useMemo(() => getDueSoonBills(state), [state]);
  const openTasks = useMemo(() => getOpenTasks(state), [state]);
  const overdueBills = useMemo(() => getOverduePayments(state), [state]);
  const upcomingEvents = useMemo(() => getUpcomingEvents(state), [state]);
  const todayTasks = useMemo(
    () => openTasks.filter((task) => !task.dueDate || task.dueDate <= todayIso).slice(0, 3),
    [openTasks, todayIso]
  );

  const income = getMonthIncomeTotal(state.money, monthKey);
  const spending = getMonthSpendingTotal(state.money, monthKey);
  const net = getNetBalance(state.money, monthKey);
  const safeToSpend = getSafeToSpend(state.money, monthKey);
  const priorityTone = getPriorityTone(overdueBills, openTasks);
  const isFirstDay = openTasks.length === 0 && state.money.bills.length === 0 && state.money.transactions.length === 0 && state.calendar.events.length === 0 && state.calendar.externalEvents.length === 0;

  const priorityCards = [
    {
      title: overdueBills.length > 0 ? `${overdueBills.length} bill${overdueBills.length === 1 ? '' : 's'} overdue` : dueSoonBills.length > 0 ? `${dueSoonBills.length} bill${dueSoonBills.length === 1 ? '' : 's'} due this week` : 'Bills look on track',
      detail: overdueBills[0]
        ? `${overdueBills[0].title} should be handled first.`
        : dueSoonBills[0]
          ? `${dueSoonBills[0].title} is the next money task.`
          : 'No unpaid bills need urgent attention right now.',
      tone: overdueBills.length > 0 ? 'danger' : dueSoonBills.length > 0 ? 'warn' : 'calm'
    },
    {
      title: openTasks.length > 0 ? `${openTasks.length} open task${openTasks.length === 1 ? '' : 's'}` : 'Tasks are all caught up',
      detail: todayTasks[0]
        ? `${todayTasks[0].title}${todayTasks[0].ownerId === activeUser?.id ? ' is yours today.' : ' is next on the family list.'}`
        : 'A calm day means fewer loose ends around the home.',
      tone: openTasks.length > 0 ? 'celebrate' : 'calm'
    },
    {
      title: upcomingEvents[0] ? `${upcomingEvents.length} thing${upcomingEvents.length === 1 ? '' : 's'} coming up` : 'Calendar is open',
      detail: upcomingEvents[0]
        ? `${upcomingEvents[0].title} is next on the calendar.`
        : 'Add an event when you want everyone aligned on plans.',
      tone: upcomingEvents[0] ? 'calm' : 'celebrate'
    }
  ];

  const primaryAction = overdueBills.length > 0
    ? {
        eyebrow: 'Fix first',
        title: `Pay ${overdueBills[0]?.title ?? 'overdue bill'}`,
        detail: overdueBills.length === 1 ? 'There is one overdue bill needing attention right now.' : `${overdueBills.length} overdue bills need attention right now.`
      }
    : todayTasks[0]
      ? {
          eyebrow: 'Do next',
          title: todayTasks[0].title,
          detail: `${todayTasks[0].ownerId === activeUser?.id ? 'Your next task is ready.' : 'A family task is due next.'} Stay on top of the day with one quick win.`
        }
      : upcomingEvents[0]
        ? {
            eyebrow: 'Coming up',
            title: upcomingEvents[0].title,
            detail: 'Your next calendar item is lined up so everyone stays in sync.'
          }
        : {
            eyebrow: 'A calm day',
            title: 'Nothing urgent right now',
            detail: 'Add a plan, task, or bill when you want the dashboard to guide the day.'
          };

  return (
    <section className="home-screen stack-lg">
      <header className={`glass-panel today-hero today-hero--${priorityTone}`}>
        <div className="today-hero-top">
          <div className="today-hero-badge-row">
            <span className="today-pill">{getTodayLabel()}</span>
            {activeCompanion ? (
              <span className="today-avatar-badge">
                {speciesEmoji[activeCompanion.species] ?? '🐾'} {moodEmoji[activeCompanion.mood] ?? '✨'}
              </span>
            ) : null}
          </div>
          <button className="btn btn-ghost" type="button" onClick={onLock}>
            Switch profile
          </button>
        </div>
        <div className="today-hero-content">
          <div>
            <p className="eyebrow">{primaryAction.eyebrow}</p>
            <h2>{getGreeting()}{activeUser ? `, ${activeUser.name}` : ''}</h2>
            <p className="muted">{primaryAction.detail}</p>
          </div>
          <div className="today-family-summary">
            <div>
              <strong>{state.users.filter((user) => user.active).length}</strong>
              <span>active family members</span>
            </div>
            <div>
              <strong>{familyTrack.familyStars}</strong>
              <span>family stars</span>
            </div>
            <div>
              <strong>{upcomingEvents.length}</strong>
              <span>upcoming plans</span>
            </div>
          </div>
        </div>
        <div className="primary-focus-card">
          <p className="metric-label">Main thing to handle</p>
          <h3>{primaryAction.title}</h3>
        </div>
      </header>

      <section className="dashboard-section stack-sm" aria-label="Today priorities">
        <div className="section-head section-head--tight">
          <div>
            <p className="eyebrow">Today’s priorities</p>
            <h3>Start here, then move on</h3>
          </div>
          <span className="section-tip">Top 3 only</span>
        </div>
        <div className="dashboard-priority-grid">
          {priorityCards.map((item) => (
            <article key={item.title} className={`glass-panel priority-card priority-card--${item.tone}`}>
              <p className="metric-label">{item.title}</p>
              <p className="muted">{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      {isFirstDay ? (
        <section className="glass-panel stack-sm" aria-label="Getting started">
          <div className="section-head section-head--tight">
            <div>
              <p className="eyebrow">Start here</p>
              <h3>Set up your first family rhythm</h3>
            </div>
          </div>
          <div className="mini-list">
            <div className="mini-list-item">
              <div>
                <p className="mini-list-title">Add one family event</p>
                <p className="muted">Start with something simple like school pickup, movie night, or an appointment.</p>
              </div>
            </div>
            <div className="mini-list-item">
              <div>
                <p className="mini-list-title">Add one shared task</p>
                <p className="muted">A quick chore helps the dashboard become useful immediately.</p>
              </div>
            </div>
            <div className="mini-list-item">
              <div>
                <p className="mini-list-title">Add one bill or transaction</p>
                <p className="muted">Even one money item makes the planner and summaries much clearer.</p>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="dashboard-snapshot-grid" aria-label="Household snapshots">
        <article className="glass-panel dashboard-card stack-sm" data-testid="metric-open-tasks">
          <div className="section-head section-head--tight">
            <div>
              <p className="eyebrow">Tasks</p>
              <h3>{openTasks.length} open</h3>
            </div>
            <span className="route-pill">{todayTasks.length} for today</span>
          </div>
          {todayTasks.length ? (
            <div className="mini-list">
              {todayTasks.map((task) => {
                const owner = state.users.find((user) => user.id === task.ownerId);
                return (
                  <div key={task.id} className="mini-list-item">
                    <div>
                      <p className="mini-list-title">{task.title}</p>
                      <p className="muted">{owner?.name ?? 'Unassigned'} · {task.dueDate ? (task.dueDate <= todayIso ? 'Today' : task.dueDate) : 'Anytime'}</p>
                    </div>
                    {task.shared ? <span className="route-pill">Shared</span> : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="muted">No urgent tasks. This is a good day to stay ahead.</p>
          )}
        </article>

        <article className="glass-panel dashboard-card stack-sm" data-testid="metric-payments-due">
          <div className="section-head section-head--tight">
            <div>
              <p className="eyebrow">Money snapshot</p>
              <h3>{formatCurrencyZAR(safeToSpend)} safe to spend</h3>
            </div>
            <span className={`route-pill ${overdueBills.length ? 'route-pill--danger' : ''}`}>{overdueBills.length} overdue</span>
          </div>
          <div className="money-brief-grid">
            <div>
              <span className="metric-label">Money in</span>
              <strong>{formatCurrencyZAR(income)}</strong>
            </div>
            <div>
              <span className="metric-label">Money out</span>
              <strong>{formatCurrencyZAR(spending)}</strong>
            </div>
            <div>
              <span className="metric-label">This month</span>
              <strong>{formatCurrencyZAR(net)}</strong>
            </div>
          </div>
          <p className="muted">
            {overdueBills.length > 0
              ? `${overdueBills.length} bill${overdueBills.length === 1 ? '' : 's'} need attention now.`
              : dueSoonBills.length > 0
                ? `${dueSoonBills.length} bill${dueSoonBills.length === 1 ? '' : 's'} due in the next 7 days.`
                : 'Bills are under control for the week ahead.'}
          </p>
        </article>
      </section>

      <section className="dashboard-snapshot-grid" aria-label="Upcoming plans and family summary">
        <article className="glass-panel home-events-panel stack-sm">
          <div className="section-head section-head--tight">
            <div>
              <p className="eyebrow">Next on the calendar</p>
              <h3>Coming up soon</h3>
            </div>
            <span className="section-tip">Next 4 items</span>
          </div>
          {upcomingEvents.length ? (
            <div className="home-events-list">
              {upcomingEvents.map((event) => (
                <div key={event.id} className="home-event-item">
                  <span className={`event-kind-dot is-${event.kind ?? 'event'}`} />
                  <div>
                    <p className="home-event-title">{event.title}</p>
                    <p className="home-event-date muted">
                      {new Intl.DateTimeFormat('en-ZA', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(event.iso))} · {event.sourceLabel}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">Nothing scheduled yet. Add a family plan to keep everyone aligned.</p>
          )}
        </article>

        <section className="glass-panel crew-strip stack-sm" aria-label="Family crew">
          <div className="section-head section-head--tight">
            <div>
              <p className="eyebrow">Family</p>
              <h3>Your crew</h3>
            </div>
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

          {state.activeUserId && activeCompanion ? <p className="muted">{activeCompanion.name} is level {activeCompanion.level} with {activeCompanion.coins} coins and {activeCompanion.stars} stars.</p> : null}
        </section>
      </section>

      <section className="glass-panel stack-sm" aria-label="Daily plan insights">
        <div className="section-head section-head--tight">
          <div>
            <p className="eyebrow">Helpful nudges</p>
            <h3>Three small reminders</h3>
          </div>
          {state.activeUserId && activeCompanion ? <span className="section-tip">Companion check-in</span> : null}
        </div>
        <div className="foundation-grid">
          {insights.slice(0, 2).map((insight) => (
            <article key={insight.title} className={`metric-card metric-card--${insight.tone}`}>
              <p className="metric-label">{insight.title}</p>
              <p className="muted">{insight.detail}</p>
            </article>
          ))}
          {state.activeUserId && activeCompanion ? (
            <article className="metric-card metric-card--celebrate stack-sm">
              <p className="metric-label">Companion quick care</p>
              <div className="quick-actions" role="group" aria-label="Quick companion care actions">
                {(['feed', 'play', 'rest'] as const).map((action) => (
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
              {reaction ? <p className="status-banner is-success">{reaction}</p> : <p className="muted">Keep the home companion happy without leaving the dashboard.</p>}
            </article>
          ) : insights[2] ? (
            <article className={`metric-card metric-card--${insights[2].tone}`}>
              <p className="metric-label">{insights[2].title}</p>
              <p className="muted">{insights[2].detail}</p>
            </article>
          ) : null}
        </div>
      </section>
    </section>
  );
};
