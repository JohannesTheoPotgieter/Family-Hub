import { useMemo, useState } from 'react';
import { CALENDAR_VIEWS, type CalendarView } from '../../lib/family-hub/constants';
import { getTodayIso, isSameDay } from '../../lib/family-hub/date';
import type { Event, Payment, Task } from '../../lib/family-hub/storage';

type Props = {
  events: Event[];
  payments: Payment[];
  tasks: Task[];
  onAddEvent: (title: string, date: string, type: Event['type']) => void;
  onAssignTaskDate: (taskId: string, date: string) => void;
};

export const CalendarScreen = ({ events, payments, tasks, onAddEvent, onAssignTaskDate }: Props) => {
  const [view, setView] = useState<CalendarView>('Month');
  const [selectedDate, setSelectedDate] = useState(getTodayIso());
  const [title, setTitle] = useState('');
  const [type, setType] = useState<Event['type']>('event');

  const datedTasks = tasks.filter((t) => !t.completed && t.dueDate);
  const undatedTasks = tasks.filter((t) => !t.completed && !t.dueDate);
  const list = useMemo(() => {
    const items = [
      ...events.map((e) => ({ id: e.id, title: e.title, date: e.date, kind: e.type === 'appointment' ? 'Appointment' : 'Event' })),
      ...payments.map((p) => ({ id: p.id, title: p.title, date: p.dueDate, kind: p.paid ? 'Payment paid' : 'Payment due' })),
      ...datedTasks.map((t) => ({ id: t.id, title: t.title, date: t.dueDate!, kind: 'Task' }))
    ];
    if (view === 'Day') return items.filter((i) => isSameDay(i.date, selectedDate));
    if (view === 'Week') return items.filter((i) => i.date >= selectedDate && i.date <= addDays(selectedDate, 7));
    if (view === 'Month') return items.filter((i) => i.date.slice(0, 7) === selectedDate.slice(0, 7));
    return items;
  }, [events, payments, datedTasks, view, selectedDate]);

  return <section className="stack-lg">
    <div className="screen-title"><h2>Calendar</h2><p className="muted">Events, payments, and tasks in one stable timeline.</p></div>
    <div className="segmented-control glass-card">{CALENDAR_VIEWS.map((item) => <button key={item} className={view === item ? 'is-active' : ''} onClick={() => setView(item)}>{item}</button>)}</div>
    <article className="glass-card stack">
      <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
      <form className="stack" onSubmit={(e) => { e.preventDefault(); if (!title.trim()) return; onAddEvent(title.trim(), selectedDate, type); setTitle(''); }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add event" />
        <select value={type} onChange={(e) => setType(e.target.value as Event['type'])}><option value="event">Event</option><option value="appointment">Special appointment</option></select>
        <button className="btn btn-primary" type="submit">Save event</button>
      </form>
    </article>
    <article className="glass-card stack" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { const taskId = e.dataTransfer.getData('task-id'); if (taskId) onAssignTaskDate(taskId, selectedDate); }}>
      <h3>{view} timeline</h3>
      {list.length ? list.sort((a, b) => a.date.localeCompare(b.date)).map((item) => <div key={`${item.kind}-${item.id}`} className="list-row"><span>{item.title}</span><span className="chip">{item.kind} • {item.date}</span></div>) : <div className="empty-state">No events yet. Add your first event, task, or payment.</div>}
    </article>
    <article className="glass-card stack">
      <h3>Undated tasks</h3>
      {undatedTasks.length ? undatedTasks.map((task) => <div key={task.id} className="list-row" draggable onDragStart={(e) => e.dataTransfer.setData('task-id', task.id)}><span>{task.title}</span><span className="chip">Drag to date</span></div>) : <div className="empty-state">No undated tasks ready to place.</div>}
    </article>
  </section>;
};

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
