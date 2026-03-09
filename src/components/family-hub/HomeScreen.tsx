import { getTodayIso } from '../../lib/family-hub/date';
import { formatCurrency } from '../../lib/family-hub/format';
import type { FamilyHubState } from '../../lib/family-hub/storage';

type Props = { state: FamilyHubState };

export const HomeScreen = ({ state }: Props) => {
  const today = getTodayIso();
  const setup = state.activeUserId ? state.userSetup[state.activeUserId] : { openingBalance: 0, monthlyIncome: 0 };
  const openTasks = state.tasks.filter((t) => !t.completed);
  const duePayments = state.payments.filter((p) => !p.paid);
  const projectedClosing = setup.openingBalance + setup.monthlyIncome + state.transactions.reduce((sum, t) => sum + t.amount, 0) - duePayments.reduce((sum, p) => sum + p.amount, 0);
  const urgent = [...openTasks.filter((t) => t.dueDate && t.dueDate <= today), ...duePayments.filter((p) => p.dueDate <= today)].slice(0, 4);
  const upcoming = [...state.events.filter((e) => e.date >= today), ...openTasks.filter((t) => t.dueDate && t.dueDate > today).map((t) => ({ ...t, date: t.dueDate! }))]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4);

  return <section className="stack-lg">
    <article className="glass-card hero-panel stack">
      <p className="eyebrow">Today • {today}</p>
      <h2>Family command center</h2>
      <p className="muted">Forecast closing {formatCurrency(projectedClosing)}</p>
    </article>
    <div className="metrics-grid">
      <article className="glass-card metric-card"><p className="metric-label">Payments due</p><p className="metric-value">{duePayments.length}</p></article>
      <article className="glass-card metric-card"><p className="metric-label">Open tasks</p><p className="metric-value">{openTasks.length}</p></article>
      <article className="glass-card metric-card"><p className="metric-label">Trips saved</p><p className="metric-value">{state.places.length}</p></article>
      <article className="glass-card metric-card"><p className="metric-label">Monthly income</p><p className="metric-value">{formatCurrency(setup.monthlyIncome)}</p></article>
    </div>
    <article className="glass-card stack"><h3>Urgent</h3>{urgent.length ? urgent.map((item) => <div key={item.id} className="list-row"><span>{item.title}</span><span className="chip">{'dueDate' in item ? 'Task' : 'Payment'}</span></div>) : <div className="empty-state">No urgent items right now.</div>}</article>
    <article className="glass-card stack"><h3>Upcoming</h3>{upcoming.length ? upcoming.map((item) => <div key={item.id} className="list-row"><span>{item.title}</span><span>{item.date}</span></div>) : <div className="empty-state">No events yet. Add your first event in Calendar.</div>}</article>
    <article className="glass-card stack"><h3>Lifestyle & places</h3>{state.places.length ? state.places.slice(0, 3).map((p) => <div key={p.id} className="list-row"><span>{p.name}</span></div>) : <div className="empty-state">No places added yet. Add your first place in More.</div>}</article>
  </section>;
};
