import { getTodayIso } from '../../lib/family-hub/date';
import { formatCurrency, formatPoints } from '../../lib/family-hub/format';
import type { FamilyHubState } from '../../lib/family-hub/storage';

type Props = { state: FamilyHubState };

export const HomeScreen = ({ state }: Props) => {
  const today = getTodayIso();
  const profile = state.activeUserId ? state.usersProfile[state.activeUserId] : null;
  const upcomingPayments = state.payments.filter((p) => !p.paid);
  const openTasks = state.tasks.filter((t) => !t.completed);
  const urgent = [...openTasks.filter((t) => t.dueDate && t.dueDate <= today), ...upcomingPayments.filter((p) => p.dueDate <= today)];
  const forecastClosing = (profile?.openingBalance ?? 0) + (profile?.monthlyIncome ?? 0) + state.transactions.reduce((a, t) => a + t.amount, 0) - upcomingPayments.reduce((a, p) => a + p.amount, 0);

  return <section className="stack-lg">
    <article className="glass-card hero-panel stack">
      <p className="eyebrow">Today · {today}</p>
      <h2>Family command center</h2>
      <p className="muted">Forecast closing: {formatCurrency(forecastClosing)}</p>
    </article>
    <div className="metrics-grid">
      <article className="glass-card metric-card"><p className="metric-label">Payments due</p><p className="metric-value">{upcomingPayments.length}</p></article>
      <article className="glass-card metric-card"><p className="metric-label">Open tasks</p><p className="metric-value">{openTasks.length}</p></article>
      <article className="glass-card metric-card"><p className="metric-label">Trips saved</p><p className="metric-value">{state.places.length}</p></article>
      <article className="glass-card metric-card"><p className="metric-label">Family points</p><p className="metric-value">{formatPoints(state.familyPoints)}</p></article>
    </div>
    <article className="glass-card stack">
      <h3>Urgent</h3>
      {!urgent.length ? <div className="empty-state">No urgent items right now.</div> : urgent.slice(0, 4).map((item) => <div key={item.id} className="list-row"><span>{item.title}</span><span className="chip">{'amount' in item ? 'Payment' : 'Task'}</span></div>)}
    </article>
    <article className="glass-card stack">
      <h3>Avatar corner</h3>
      <div className="chip-list">{state.users.map((u) => <span key={u.id} className="chip">{u.name}: {state.usersProfile[u.id].avatar.base} · {state.usersProfile[u.id].avatar.mood}</span>)}</div>
    </article>
  </section>;
};
