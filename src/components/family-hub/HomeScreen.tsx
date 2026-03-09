import type { FamilyHubState } from '../../lib/family-hub/storage';
import { formatCurrency } from '../../lib/family-hub/format';

type Props = { state: FamilyHubState };

export const HomeScreen = ({ state }: Props) => {
  const openTasks = state.tasks.filter((task) => !task.completed);
  const duePayments = state.payments.filter((payment) => !payment.paid);
  const upcomingEvents = state.events.slice(0, 3);
  const totalDue = duePayments.reduce((sum, payment) => sum + payment.amount, 0);

  return (
    <section className="stack-lg">
      <div className="screen-title">
        <h2>Home</h2>
        <p className="muted">Your household at a glance.</p>
      </div>

      <div className="metrics-grid">
        <article className="glass-card metric-card">
          <p className="metric-label">Open tasks</p>
          <p className="metric-value">{openTasks.length}</p>
        </article>
        <article className="glass-card metric-card">
          <p className="metric-label">Payments due</p>
          <p className="metric-value">{duePayments.length}</p>
        </article>
        <article className="glass-card metric-card">
          <p className="metric-label">Amount due</p>
          <p className="metric-value">{formatCurrency(totalDue)}</p>
        </article>
      </div>

      <article className="glass-card stack">
        <h3>Priority preview</h3>
        {openTasks.length === 0 && duePayments.length === 0 && upcomingEvents.length === 0 ? (
          <div className="empty-state">You are all clear. Add a task, event, or payment to get started.</div>
        ) : (
          <>
            <div>
              <p className="small-title">Tasks</p>
              {openTasks.length ? (
                openTasks.slice(0, 2).map((task) => <div key={task.id} className="list-row">{task.title}</div>)
              ) : (
                <p className="muted">No open tasks.</p>
              )}
            </div>
            <div>
              <p className="small-title">Payments</p>
              {duePayments.length ? (
                duePayments.slice(0, 2).map((payment) => (
                  <div key={payment.id} className="list-row">
                    {payment.title}
                    <span>{formatCurrency(payment.amount)}</span>
                  </div>
                ))
              ) : (
                <p className="muted">No pending payments.</p>
              )}
            </div>
            <div>
              <p className="small-title">Calendar</p>
              {upcomingEvents.length ? (
                upcomingEvents.map((event) => <div key={event.id} className="list-row">{event.title}</div>)
              ) : (
                <p className="muted">No upcoming events.</p>
              )}
            </div>
          </>
        )}
      </article>
    </section>
  );
};
