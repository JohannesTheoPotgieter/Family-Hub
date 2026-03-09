import type { FamilyHubState } from '../../lib/family-hub/storage';
import { MetricCard } from './MetricCard';

type Props = { state: FamilyHubState };

export const HomeScreen = ({ state }: Props) => (
  <section className="stack">
    <h2>Home</h2>
    <div className="grid">
      <MetricCard label="Tasks open" value={String(state.tasks.filter((t) => !t.completed).length)} />
      <MetricCard label="Events" value={String(state.events.length)} />
      <MetricCard label="Payments due" value={String(state.payments.filter((p) => !p.paid).length)} />
    </div>
    <div className="card">
      <h3>Quick status</h3>
      <ul>
        <li>{state.tasks.length ? `${state.tasks.length} tasks tracked` : 'No tasks yet'}</li>
        <li>{state.events.length ? `${state.events.length} events scheduled` : 'No events yet'}</li>
        <li>{state.payments.length ? `${state.payments.length} payments tracked` : 'No payments due yet'}</li>
      </ul>
    </div>
  </section>
);
