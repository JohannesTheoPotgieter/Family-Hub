import { useMemo, useState } from 'react';
import type { Task } from '../../lib/family-hub/storage';

type Props = {
  tasks: Task[];
  onAdd: (title: string) => void;
  onToggle: (id: string) => void;
};

export const TasksScreen = ({ tasks, onAdd, onToggle }: Props) => {
  const [title, setTitle] = useState('');
  const [filter, setFilter] = useState<'All' | 'Open' | 'Done'>('All');

  const visibleTasks = useMemo(() => {
    if (filter === 'Open') return tasks.filter((task) => !task.completed);
    if (filter === 'Done') return tasks.filter((task) => task.completed);
    return tasks;
  }, [tasks, filter]);

  return (
    <section className="stack-lg">
      <div className="screen-title">
        <h2>Tasks</h2>
        <p className="muted">Keep family responsibilities clear and trackable.</p>
      </div>

      <article className="glass-card stack">
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            onAdd(title.trim());
            setTitle('');
          }}
        >
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a new task" />
          <button className="btn btn-primary" type="submit">
            Add task
          </button>
        </form>
      </article>

      <div className="segmented-control glass-card">
        {(['All', 'Open', 'Done'] as const).map((item) => (
          <button key={item} className={filter === item ? 'is-active' : ''} onClick={() => setFilter(item)}>
            {item}
          </button>
        ))}
      </div>

      <article className="stack">
        {!visibleTasks.length ? (
          <div className="empty-state">No tasks in this view.</div>
        ) : (
          visibleTasks.map((task) => (
            <label key={task.id} className={`glass-card task-row ${task.completed ? 'is-done' : ''}`}>
              <input type="checkbox" checked={task.completed} onChange={() => onToggle(task.id)} />
              <span>{task.title}</span>
            </label>
          ))
        )}
      </article>
    </section>
  );
};
