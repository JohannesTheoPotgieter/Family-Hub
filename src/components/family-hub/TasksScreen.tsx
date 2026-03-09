import { useMemo, useState } from 'react';
import { TASK_FILTERS, type TaskFilter, type UserId } from '../../lib/family-hub/constants';
import { getTodayIso } from '../../lib/family-hub/date';
import type { Task } from '../../lib/family-hub/storage';

type Props = {
  tasks: Task[];
  activeUserId: UserId;
  onAdd: (title: string, dueDate: string | undefined, waiting: boolean, owner: UserId | 'shared') => void;
  onToggle: (id: string) => void;
};

export const TasksScreen = ({ tasks, activeUserId, onAdd, onToggle }: Props) => {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState(getTodayIso());
  const [noDueDate, setNoDueDate] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [owner, setOwner] = useState<UserId | 'shared'>('shared');
  const [filter, setFilter] = useState<TaskFilter>('Today');
  const today = getTodayIso();

  const visibleTasks = useMemo(() => {
    const mineOrShared = tasks.filter((t) => t.owner === 'shared' || t.owner === activeUserId);
    if (filter === 'Done') return mineOrShared.filter((t) => t.completed);
    if (filter === 'Waiting') return mineOrShared.filter((t) => !t.completed && t.waiting);
    if (filter === 'Upcoming') return mineOrShared.filter((t) => !t.completed && !t.waiting && !!t.dueDate && t.dueDate > today);
    return mineOrShared.filter((t) => !t.completed && !t.waiting && (!t.dueDate || t.dueDate <= today));
  }, [tasks, filter, today, activeUserId]);

  return <section className="stack-lg">
    <div className="screen-title"><h2>Tasks</h2><p className="muted">Today, upcoming, waiting, and done with clear ownership.</p></div>
    <article className="glass-card stack">
      <form className="stack" onSubmit={(e) => { e.preventDefault(); if (!title.trim()) return; onAdd(title.trim(), noDueDate ? undefined : dueDate, waiting, owner); setTitle(''); }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add first task" />
        <label className="switch-row"><input type="checkbox" checked={noDueDate} onChange={(e) => setNoDueDate(e.target.checked)} /><span>No due date</span></label>
        {!noDueDate && <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />}
        <select value={owner} onChange={(e) => setOwner(e.target.value as UserId | 'shared')}><option value="shared">Shared</option><option value="johannes">Johannes</option><option value="nicole">Nicole</option></select>
        <label className="switch-row"><input type="checkbox" checked={waiting} onChange={(e) => setWaiting(e.target.checked)} /><span>Mark as waiting</span></label>
        <button className="btn btn-primary" type="submit">Save task</button>
      </form>
    </article>
    <div className="segmented-control glass-card">{TASK_FILTERS.map((item) => <button key={item} className={filter === item ? 'is-active' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div>
    <article className="stack">{visibleTasks.length ? visibleTasks.map((task) => <label key={task.id} className={`glass-card task-row ${task.completed ? 'is-done' : ''}`}><input type="checkbox" checked={task.completed} onChange={() => onToggle(task.id)} /><div><strong>{task.title}</strong><p className="muted">{task.owner === 'shared' ? 'Shared' : task.owner} • {task.dueDate ? `Due ${task.dueDate}` : 'No due date'}{task.waiting ? ' • Waiting' : ''}</p></div></label>) : <div className="glass-card empty-state">No tasks yet in this view.</div>}</article>
  </section>;
};
