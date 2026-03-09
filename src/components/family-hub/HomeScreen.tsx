import { getTodayIso } from '../../lib/family-hub/date';
import { formatCurrency } from '../../lib/family-hub/format';
import type { FamilyHubState } from '../../lib/family-hub/storage';

type Props = { state: FamilyHubState };

export const HomeScreen = ({ state }: Props) => {
  const today = getTodayIso();
  const duePayments = state.payments.filter((p) => !p.paid);
  const openTasks = state.tasks.filter((t) => !t.completed);
  const urgentTasks = openTasks.filter((t) => t.dueDate <= today && !t.waiting);
  const upcoming = [...state.events.filter((e) => e.date >= today).slice(0, 3), ...duePayments.slice(0, 2)];

  return (
    <section className="stack-lg">
      <article className="glass-card hero-panel stack">
        <p className="eyebrow">Today</p>
        <h2>Command center</h2>
        <p className="muted">Forecast closing: {formatCurrency(duePayments.reduce((sum, p) => sum + p.amount, 0) * -1)}</p>
      </article>

      <div className="metrics-grid">
        <article className="glass-card metric-card"><p className="metric-label">Payments due</p><p className="metric-value">{duePayments.length}</p></article>
        <article className="glass-card metric-card"><p className="metric-label">Open tasks</p><p className="metric-value">{openTasks.length}</p></article>
        <article className="glass-card metric-card"><p className="metric-label">Trips saved</p><p className="metric-value">{state.places.length}</p></article>
      </div>

      <article className="glass-card stack">
        <h3>Urgent</h3>
        {!urgentTasks.length && !duePayments.length ? <div className="empty-state">No urgent items right now.</div> : null}
        {urgentTasks.slice(0, 2).map((task) => <div key={task.id} className="list-row"><span>{task.title}</span><span className="chip">Task</span></div>)}
        {duePayments.slice(0, 2).map((payment) => (
          <div key={payment.id} className="list-row"><span>{payment.title}</span><span>{formatCurrency(payment.amount)}</span></div>
        ))}
      </article>

      <article className="glass-card stack">
        <h3>Upcoming</h3>
        {!upcoming.length ? <div className="empty-state">No events yet. Add your first event in Calendar.</div> : null}
        {upcoming.map((item) => (
          <div key={item.id} className="list-row"><span>{item.title}</span><span className="muted">{'date' in item ? item.date : item.dueDate}</span></div>
        ))}
      </article>

      <article className="glass-card stack">
        <h3>Places</h3>
        {!state.places.length ? <div className="empty-state">No places added yet. Add your first place in More.</div> : state.places.slice(0, 3).map((p) => <div key={p.id} className="list-row">{p.name}</div>)}
      </article>
    </section>
  );
};
