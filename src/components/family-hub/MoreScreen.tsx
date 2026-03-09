import type { User } from '../../lib/family-hub/constants';
import type { Place, Reminder } from '../../lib/family-hub/storage';

type Props = {
  users: User[];
  places: Place[];
  reminders: Reminder[];
};

export const MoreScreen = ({ users, places, reminders }: Props) => (
  <section className="stack">
    <h2>More</h2>
    <div className="card">
      <h3>Family users</h3>
      <ul>
        {users.map((u) => (
          <li key={u.id}>
            {u.name} {u.active ? '' : '(inactive)'}
          </li>
        ))}
      </ul>
    </div>
    <div className="card">{places.length ? `${places.length} places saved` : 'No places added yet'}</div>
    <div className="card">{reminders.length ? `${reminders.length} reminders` : 'No reminders yet'}</div>
  </section>
);
