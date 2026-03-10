import { useMemo, useState } from 'react';
import { TASK_FILTERS, type TaskFilter, type UserId } from '../../lib/family-hub/constants';
import { getTodayIso } from '../../lib/family-hub/date';
import type { Task } from '../../lib/family-hub/storage';

type Props = {
  tasks: Task[];
  activeUserId: UserId;
  onAdd: (task: Omit<Task, 'id' | 'completed'>) => void;
  onToggle: (id: string) => void;
};

export const TasksScreen = ({ tasks, activeUserId, onAdd, onToggle }: Props) => {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState(getTodayIso());
  const [noDate, setNoDate] = useState(false);
  const [shared, setShared] = useState(true);
  const [waiting, setWaiting] = useState(false);
  const [filter, setFilter] = useState<TaskFilter>('Today');
  const today = getTodayIso();

  const visibleTasks = useMemo(() => {
    if (filter === 'Done') return tasks.filter((t) => t.completed);
    if (filter === 'Waiting') return tasks.filter((t) => !t.completed && t.waiting);
    if (filter === 'Upcoming') return tasks.filter((t) => !t.completed && t.dueDate && t.dueDate > today);
    return tasks.filter((t) => !t.completed && !t.waiting && (!t.dueDate || t.dueDate <= today));
  }, [tasks, filter, today]);

  return <section className="stack-lg">
    <div className="screen-title"><h2>Tasks</h2><p className="muted">Today, upcoming, waiting, and done in one flow.</p></div>
    <article className="glass-card stack">
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add your first task" />
      <label className="switch-row"><input type="checkbox" checked={noDate} onChange={(e) => setNoDate(e.target.checked)} /><span>No due date yet</span></label>
      {!noDate && <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />}
      <label className="switch-row"><input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} /><span>Shared task</span></label>
      <label className="switch-row"><input type="checkbox" checked={waiting} onChange={(e) => setWaiting(e.target.checked)} /><span>Waiting</span></label>
      <button className="btn btn-primary" onClick={() => {
        if (!title.trim()) return;
        onAdd({ title: title.trim(), dueDate: noDate ? undefined : dueDate, waiting, shared, ownerId: activeUserId });
        setTitle('');
      }}>Save task</button>
    </article>
    <div className="segmented-control glass-card">{TASK_FILTERS.map((item) => <button key={item} className={filter === item ? 'is-active' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div>
    {!visibleTasks.length ? <div className="glass-card empty-state">No tasks yet.</div> : visibleTasks.map((task) => <label key={task.id} className={`glass-card task-row ${task.completed ? 'is-done' : ''}`}><input type="checkbox" checked={task.completed} onChange={() => onToggle(task.id)} /><div><strong>{task.title}</strong><p className="muted">{task.dueDate ? `Due ${task.dueDate}` : 'No date yet'} {task.shared ? '· Shared' : ''} {task.waiting ? '· Waiting' : ''}</p></div></label>)}
  </section>;
};
