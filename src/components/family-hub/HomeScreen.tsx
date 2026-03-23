import { useMemo, useState } from 'react';
import type { UserId } from '../../lib/family-hub/constants';
import type { AuditEntry, Bill, FamilyHubState, TaskItem } from '../../lib/family-hub/storage';
import { formatCurrencyZAR, getMonthIncomeTotal, getMonthSpendingTotal, getNetBalance, getSafeToSpend } from '../../lib/family-hub/money';
import { getTodayIso } from '../../lib/family-hub/date';
import { buildHomeInsights } from '../../lib/family-hub/homeInsights';

type CareAction = 'feed' | 'play' | 'clean' | 'rest' | 'pet' | 'story';

type HomeScreenProps = {
  state: FamilyHubState;
  onCareAction: (userId: UserId, action: CareAction) => void;
  onLock: () => void;
};

type HomeEvent = {
  id: string;
  title: string;
  iso: string;
  kind: string;
  sourceLabel: string;
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
  sparkly: '✨',
  excited: '⚡',
  silly: '🎉'
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
    .sort((a, b) => a.iso.localeCompare(b.iso));
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

const getTaskTimingLabel = (task: TaskItem, ownerName: string | undefined, todayIso: string) => {
  if (!task.dueDate) return `${ownerName ?? 'Family'} · Anytime`;
  if (task.dueDate < todayIso) return `${ownerName ?? 'Family'} · Overdue`;
  if (task.dueDate === todayIso) return `${ownerName ?? 'Family'} · Today`;
  return `${ownerName ?? 'Family'} · ${new Intl.DateTimeFormat('en-ZA', { month: 'short', day: 'numeric' }).format(new Date(`${task.dueDate}T12:00:00`))}`;
};

const getEventTimingLabel = (event: HomeEvent) => {
  const date = new Date(event.iso);
  return new Intl.DateTimeFormat('en-ZA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: event.iso.includes('T12:00:00.000Z') ? undefined : 'numeric',
    minute: event.iso.includes('T12:00:00.000Z') ? undefined : '2-digit'
  }).format(date);
};

const getChangeLabel = (entry: AuditEntry) => {
  const lowerType = entry.type.toLowerCase();
  if (lowerType.includes('task')) return 'Task updated';
  if (lowerType.includes('bill') || lowerType.includes('money') || lowerType.includes('transaction')) return 'Money updated';
  if (lowerType.includes('calendar') || lowerType.includes('event')) return 'Calendar updated';
  if (lowerType.includes('avatar') || lowerType.includes('reward')) return 'Family progress';
  return 'Recent change';
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
    () => openTasks.filter((task) => !task.dueDate || task.dueDate <= todayIso).slice(0, 4),
    [openTasks, todayIso]
  );
  const recentChanges = useMemo(() => state.auditLog.slice(0, 4), [state.auditLog]);

  const income = getMonthIncomeTotal(state.money, monthKey);
  const spending = getMonthSpendingTotal(state.money, monthKey);
  const net = getNetBalance(state.money, monthKey);
  const safeToSpend = getSafeToSpend(state.money, monthKey);
  const priorityTone = getPriorityTone(overdueBills, openTasks);
  const isFirstDay = openTasks.length === 0 && state.money.bills.length === 0 && state.money.transactions.length === 0 && state.calendar.events.length === 0 && state.calendar.externalEvents.length === 0;

  const todayHeadline = overdueBills.length > 0
    ? `${overdueBills.length} urgent money item${overdueBills.length === 1 ? '' : 's'} need attention`
    : todayTasks.length > 0
      ? `${todayTasks.length} task${todayTasks.length === 1 ? '' : 's'} are ready for today`
      : upcomingEvents.length > 0
        ? `${upcomingEvents.length} plan${upcomingEvents.length === 1 ? '' : 's'} are coming up`
        : 'Everything looks calm right now';

  const nextAction = overdueBills.length > 0
    ? {
        eyebrow: 'Do next',
        title: `Pay ${overdueBills[0]?.title ?? 'overdue bill'}`,
        detail: 'Clear the most time-sensitive money item first so the rest of the day feels lighter.',
        tone: 'danger'
      }
    : todayTasks[0]
      ? {
          eyebrow: 'Do next',
          title: todayTasks[0].title,
          detail: `${todayTasks[0].ownerId === activeUser?.id ? 'This one belongs to you.' : 'This is the clearest family task to handle next.'}`,
          tone: 'warn'
        }
      : upcomingEvents[0]
        ? {
            eyebrow: 'Coming up',
            title: upcomingEvents[0].title,
            detail: 'Your next calendar item is the main thing to keep in mind today.',
            tone: 'calm'
          }
        : {
            eyebrow: 'Breathe easy',
            title: 'Nothing urgent is waiting',
            detail: 'Use quick actions to add plans when your family day starts to fill up.',
            tone: 'celebrate'
          };

  const todayOverview = [
    {
      label: 'Need now',
      value: overdueBills.length > 0 ? `${overdueBills.length} urgent` : todayTasks.length > 0 ? `${todayTasks.length} ready` : 'All clear',
      detail: overdueBills.length > 0 ? 'Bills overdue' : todayTasks.length > 0 ? 'Tasks due today' : 'No urgent blockers',
      tone: overdueBills.length > 0 ? 'danger' : todayTasks.length > 0 ? 'warn' : 'calm'
    },
    {
      label: 'Changed',
      value: recentChanges.length ? `${recentChanges.length} updates` : 'Quiet',
      detail: recentChanges[0] ? recentChanges[0].detail : 'No recent family changes',
      tone: recentChanges.length ? 'celebrate' : 'calm'
    },
    {
      label: 'Plans',
      value: upcomingEvents.length ? `${Math.min(upcomingEvents.length, 9)} upcoming` : 'Open day',
      detail: upcomingEvents[0] ? upcomingEvents[0].title : 'No events scheduled yet',
      tone: 'calm'
    },
    {
      label: 'Money',
      value: formatCurrencyZAR(safeToSpend),
      detail: 'Safe to spend',
      tone: net < 0 ? 'warn' : 'celebrate'
    }
  ];

  return (
    <section className="home-screen home-command-center stack-lg">
      <header className={`glass-panel command-hero command-hero--${priorityTone}`}>
        <div className="command-hero-top">
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

        <div className="command-hero-main">
          <div className="stack-sm">
            <p className="eyebrow">Today overview</p>
            <h2>{getGreeting()}{activeUser ? `, ${activeUser.name}` : ''}</h2>
            <p className="command-hero-summary">{todayHeadline}</p>
            <p className="muted">A warm, at-a-glance family view that helps you spot what matters now, what comes next, and what quietly changed.</p>
          </div>

          <article className={`primary-action-card primary-action-card--${nextAction.tone}`}>
            <p className="metric-label">{nextAction.eyebrow}</p>
            <h3>{nextAction.title}</h3>
            <p className="muted">{nextAction.detail}</p>
          </article>
        </div>

        <div className="today-overview-grid" aria-label="Today overview metrics">
          {todayOverview.map((item) => (
            <article key={item.label} className={`today-overview-card today-overview-card--${item.tone}`}>
              <p className="metric-label">{item.label}</p>
              <strong>{item.value}</strong>
              <p className="muted">{item.detail}</p>
            </article>
          ))}
        </div>
      </header>

      {isFirstDay ? (
        <section className="glass-panel command-empty-state stack-sm" aria-label="Getting started">
          <div className="section-head section-head--tight">
            <div>
              <p className="eyebrow">Empty state</p>
              <h3>Your family command center is ready</h3>
            </div>
            <span className="section-tip">Start small</span>
          </div>
          <div className="mini-list">
            <div className="mini-list-item">
              <div>
                <p className="mini-list-title">Add one event</p>
                <p className="muted">Try school pickup, dinner out, or an appointment so everyone can see what is coming.</p>
              </div>
            </div>
            <div className="mini-list-item">
              <div>
                <p className="mini-list-title">Add one task</p>
                <p className="muted">A shared chore is enough to make the home screen useful immediately.</p>
              </div>
            </div>
            <div className="mini-list-item">
              <div>
                <p className="mini-list-title">Add one money item</p>
                <p className="muted">One bill or transaction gives the money snapshot context for the week ahead.</p>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <div className="command-layout-grid">
        <div className="command-main-column stack-lg">
          <section className="glass-panel command-section stack-sm" aria-label="Upcoming calendar">
            <div className="section-head">
              <div>
                <p className="eyebrow">Upcoming calendar</p>
                <h3>What the family is moving toward</h3>
              </div>
              <span className="section-tip">Next 5 items</span>
            </div>
            {upcomingEvents.length ? (
              <div className="command-list">
                {upcomingEvents.slice(0, 5).map((event) => (
                  <article key={event.id} className="command-list-item">
                    <span className={`event-kind-dot is-${event.kind ?? 'event'}`} />
                    <div className="command-list-content">
                      <p className="command-list-title">{event.title}</p>
                      <p className="muted">{getEventTimingLabel(event)} · {event.sourceLabel}</p>
                    </div>
                    <span className="route-pill">{event.kind === 'appointment' ? 'Appointment' : 'Plan'}</span>
                  </article>
                ))}
              </div>
            ) : (
              <div className="soft-empty-card">
                <p className="mini-list-title">No upcoming plans yet</p>
                <p className="muted">Add a family event to make this area your shared “what’s next” lane.</p>
              </div>
            )}
          </section>

          <section className="glass-panel command-section stack-sm" aria-label="Urgent tasks and chores">
            <div className="section-head">
              <div>
                <p className="eyebrow">Urgent tasks & chores</p>
                <h3>What should happen next</h3>
              </div>
              <span className="section-tip">Top {todayTasks.length || 3}</span>
            </div>
            {todayTasks.length ? (
              <div className="command-list">
                {todayTasks.map((task) => {
                  const owner = state.users.find((user) => user.id === task.ownerId);
                  return (
                    <article key={task.id} className="command-list-item command-list-item--actionable">
                      <div className="command-rank-badge">{task.dueDate && task.dueDate < todayIso ? '!' : '•'}</div>
                      <div className="command-list-content">
                        <p className="command-list-title">{task.title}</p>
                        <p className="muted">{getTaskTimingLabel(task, owner?.name, todayIso)}</p>
                      </div>
                      {task.shared ? <span className="route-pill">Shared</span> : null}
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="soft-empty-card">
                <p className="mini-list-title">No urgent chores right now</p>
                <p className="muted">That means the family is caught up. Keep this space for only the tasks that matter today.</p>
              </div>
            )}
          </section>

          <section className="glass-panel command-section stack-sm" aria-label="What changed">
            <div className="section-head">
              <div>
                <p className="eyebrow">What changed</p>
                <h3>Recent family updates</h3>
              </div>
              <span className="section-tip">Latest activity</span>
            </div>
            {recentChanges.length ? (
              <div className="command-change-grid">
                {recentChanges.map((entry) => (
                  <article key={entry.id} className="change-card">
                    <p className="metric-label">{getChangeLabel(entry)}</p>
                    <p className="change-card-title">{entry.detail}</p>
                    <p className="muted">{new Intl.DateTimeFormat('en-ZA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(entry.createdAtIso))}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="soft-empty-card soft-empty-card--loading">
                <p className="mini-list-title">Nothing changed recently</p>
                <p className="muted">When tasks, plans, or money updates happen, a quick family activity stream will appear here.</p>
              </div>
            )}
          </section>
        </div>

        <aside className="command-side-column stack-lg">
          <section className="glass-panel command-section stack-sm" aria-label="Money snapshot">
            <div className="section-head">
              <div>
                <p className="eyebrow">Money snapshot</p>
                <h3>{formatCurrencyZAR(safeToSpend)} safe to spend</h3>
              </div>
              <span className={`route-pill ${overdueBills.length ? 'route-pill--danger' : ''}`}>{overdueBills.length} overdue</span>
            </div>
            <div className="money-brief-grid money-brief-grid--home">
              <div>
                <span className="metric-label">In</span>
                <strong>{formatCurrencyZAR(income)}</strong>
              </div>
              <div>
                <span className="metric-label">Out</span>
                <strong>{formatCurrencyZAR(spending)}</strong>
              </div>
              <div>
                <span className="metric-label">Net</span>
                <strong>{formatCurrencyZAR(net)}</strong>
              </div>
            </div>
            <p className="muted">
              {overdueBills.length > 0
                ? `${overdueBills.length} bill${overdueBills.length === 1 ? '' : 's'} need attention now.`
                : dueSoonBills.length > 0
                  ? `${dueSoonBills.length} bill${dueSoonBills.length === 1 ? '' : 's'} are due over the next 7 days.`
                  : 'Bills look calm for the week ahead.'}
            </p>
          </section>

          <section className="glass-panel command-section stack-sm" aria-label="Family progress">
            <div className="section-head">
              <div>
                <p className="eyebrow">Family activity & rewards</p>
                <h3>Momentum feels visible</h3>
              </div>
              <span className="crew-points">{familyTrack.familyStars} stars</span>
            </div>
            <div className="family-progress-strip">
              <article className="family-progress-card">
                <p className="metric-label">Family stars</p>
                <strong>{familyTrack.familyStars}</strong>
                <p className="muted">Shared wins add up across the household.</p>
              </article>
              <article className="family-progress-card">
                <p className="metric-label">Active members</p>
                <strong>{state.users.filter((user) => user.active).length}</strong>
                <p className="muted">Everyone in one calm shared view.</p>
              </article>
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

          <section className="glass-panel command-section stack-sm" aria-label="Quick actions">
            <div className="section-head">
              <div>
                <p className="eyebrow">Quick actions</p>
                <h3>Keep the day moving</h3>
              </div>
              <span className="section-tip">One tap</span>
            </div>
            <div className="quick-actions quick-actions--home" role="group" aria-label="Quick actions">
              <button className="chip-action" type="button" onClick={onLock}>Switch profile</button>
              {state.activeUserId && activeCompanion ? (
                <>
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
                </>
              ) : null}
            </div>
            {reaction ? <p className="status-banner is-success">{reaction}</p> : <p className="muted">Short, friendly actions belong here so the screen feels useful instead of busy.</p>}
          </section>

          <section className="glass-panel command-section stack-sm" aria-label="Helpful nudges and loading states">
            <div className="section-head">
              <div>
                <p className="eyebrow">Helpful nudges</p>
                <h3>Suggested copy & states</h3>
              </div>
            </div>
            <div className="command-change-grid">
              {insights.slice(0, 2).map((insight) => (
                <article key={insight.title} className={`change-card change-card--${insight.tone}`}>
                  <p className="metric-label">{insight.title}</p>
                  <p className="change-card-title">{insight.detail}</p>
                </article>
              ))}
              <article className="change-card skeleton-card">
                <p className="metric-label">Loading state</p>
                <p className="change-card-title">Refreshing your family day…</p>
                <div className="skeleton-lines" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
              </article>
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
};
