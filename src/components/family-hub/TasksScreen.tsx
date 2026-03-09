import { useMemo, useState } from 'react';
import { TASK_FILTERS, type TaskFilter } from '../../lib/family-hub/constants';
import { getTodayIso } from '../../lib/family-hub/date';
import type { Task } from '../../lib/family-hub/storage';

type Props = {
  tasks: Task[];
  onAdd: (title: string, dueDate: string, waiting: boolean) => void;
  onToggle: (id: string) => void;
};

export const TasksScreen = ({ tasks, onAdd, onToggle }: Props) => {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState(getTodayIso());
  const [waiting, setWaiting] = useState(false);
  const [filter, setFilter] = useState<TaskFilter>('Today');
  const today = getTodayIso();

  const visibleTasks = useMemo(() => {
    if (filter === 'Done') return tasks.filter((t) => t.completed);
    if (filter === 'Waiting') return tasks.filter((t) => !t.completed && t.waiting);
    if (filter === 'Upcoming') return tasks.filter((t) => !t.completed && !t.waiting && t.dueDate > today);
    return tasks.filter((t) => !t.completed && !t.waiting && t.dueDate <= today);
  }, [tasks, filter, today]);

  return (
    <section className="stack-lg">
      <div className="screen-title"><h2>Tasks</h2><p className="muted">Clear ownership, clear due dates, calm execution.</p></div>
      <article className="glass-card stack">
        <form className="stack" onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          onAdd(title.trim(), dueDate, waiting);
          setTitle('');
        }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add task" />
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <label className="switch-row"><input type="checkbox" checked={waiting} onChange={(e) => setWaiting(e.target.checked)} /><span>Mark as waiting</span></label>
          <button className="btn btn-primary" type="submit">Save task</button>
        </form>
      </article>
      <div className="segmented-control glass-card">{TASK_FILTERS.map((item) => <button key={item} className={filter === item ? 'is-active' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div>
      <article className="stack">
        {!visibleTasks.length ? <div className="glass-card empty-state">No tasks yet in this view.</div> : visibleTasks.map((task) => (
          <label key={task.id} className={`glass-card task-row ${task.completed ? 'is-done' : ''}`}>
            <input type="checkbox" checked={task.completed} onChange={() => onToggle(task.id)} />
            <div>
              <strong>{task.title}</strong>
              <p className="muted">Due {task.dueDate}{task.waiting ? ' • Waiting' : ''}</p>
            </div>
          </label>
        ))}
      </article>
    </section>
  );
};
