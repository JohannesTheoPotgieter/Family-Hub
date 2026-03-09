import type { User } from '../../lib/family-hub/constants';
import type { Place, Reminder } from '../../lib/family-hub/storage';

type Props = {
  users: User[];
  places: Place[];
  reminders: Reminder[];
};

export const MoreScreen = ({ users, places, reminders }: Props) => (
  <section className="stack-lg">
    <div className="screen-title">
      <h2>More</h2>
      <p className="muted">Family members, places, and reminders.</p>
    </div>

    <article className="glass-card stack">
      <h3>Family users</h3>
      {users.map((user) => (
        <div key={user.id} className="list-row">
          <span>{user.name}</span>
          <span className={`chip ${user.active ? 'chip-active' : 'chip-muted'}`}>{user.active ? 'Active' : 'Inactive'}</span>
        </div>
      ))}
    </article>

    <article className="glass-card stack">
      <h3>Saved places</h3>
      <div className="muted">{places.length ? `${places.length} places added` : 'No places added yet.'}</div>
    </article>

    <article className="glass-card stack">
      <h3>Reminders</h3>
      <div className="muted">{reminders.length ? `${reminders.length} reminders created` : 'No reminders yet.'}</div>
    </article>
  </section>
);
