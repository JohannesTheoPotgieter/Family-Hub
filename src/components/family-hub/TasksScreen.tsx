import { useState } from 'react';
import type { Task } from '../../lib/family-hub/storage';

type Props = {
  tasks: Task[];
  onAdd: (title: string) => void;
  onToggle: (id: string) => void;
};

export const TasksScreen = ({ tasks, onAdd, onToggle }: Props) => {
  const [title, setTitle] = useState('');
  return (
    <section className="stack">
      <h2>Tasks</h2>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = title.trim();
          if (!trimmed) return;
          onAdd(trimmed);
          setTitle('');
        }}
      >
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add task" />
        <button type="submit">Save</button>
      </form>
      {!tasks.length ? (
        <div className="empty">No tasks yet</div>
      ) : (
        <ul className="list">
          {tasks.map((task) => (
            <li key={task.id} className="row spread">
              <label>
                <input type="checkbox" checked={task.completed} onChange={() => onToggle(task.id)} /> {task.title}
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
