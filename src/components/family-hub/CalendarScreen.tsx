import { useMemo, useState } from 'react';
import { getTodayIso, isSameDay } from '../../lib/family-hub/date';
import { formatCurrency } from '../../lib/family-hub/format';
import type { Event, Payment, Task } from '../../lib/family-hub/storage';

type View = 'Month' | 'Week' | 'Day' | 'Agenda';

type Props = {
  events: Event[];
  payments: Payment[];
  tasks: Task[];
  onAddEvent: (title: string, date: string, type: Event['type']) => void;
  onScheduleTask: (taskId: string, date: string) => void;
};

export const CalendarScreen = ({ events, payments, tasks, onAddEvent, onScheduleTask }: Props) => {
  const [view, setView] = useState<View>('Month');
  const [selectedDate, setSelectedDate] = useState(getTodayIso());
  const [title, setTitle] = useState('');
  const [type, setType] = useState<Event['type']>('event');

  const items = useMemo(() => {
    const dayEvents = events.filter((event) => isSameDay(event.date, selectedDate)).map((event) => ({ id: event.id, label: event.title, date: event.date, kind: event.type }));
    const dayPayments = payments.filter((payment) => isSameDay(payment.dueDate, selectedDate)).map((payment) => ({ id: payment.id, label: `${payment.title} · ${formatCurrency(payment.amount)}`, date: payment.dueDate, kind: payment.paid ? 'payment-paid' : 'payment' }));
    const dayTasks = tasks.filter((task) => task.dueDate && isSameDay(task.dueDate, selectedDate)).map((task) => ({ id: task.id, label: task.title, date: task.dueDate!, kind: task.completed ? 'task-done' : 'task' }));
    return [...dayEvents, ...dayPayments, ...dayTasks];
  }, [events, payments, tasks, selectedDate]);

  const unscheduled = tasks.filter((task) => !task.dueDate && !task.completed);

  return <section className="stack-lg">
    <div className="screen-title"><h2>Calendar</h2><p className="muted">Month, week, day and agenda with events, payments, and tasks.</p></div>
    <div className="segmented-control glass-card">{(['Month', 'Week', 'Day', 'Agenda'] as View[]).map((v) => <button key={v} className={view === v ? 'is-active' : ''} onClick={() => setView(v)}>{v}</button>)}</div>
    <article className="glass-card stack">
      <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add event" />
      <select value={type} onChange={(e) => setType(e.target.value as Event['type'])}><option value="event">Event</option><option value="appointment">Special appointment</option></select>
      <button className="btn btn-primary" onClick={() => { if (!title.trim()) return; onAddEvent(title.trim(), selectedDate, type); setTitle(''); }}>Save event</button>
    </article>

    <article className="glass-card stack" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { const taskId = e.dataTransfer.getData('text/plain'); if (taskId) onScheduleTask(taskId, selectedDate); }}>
      <h3>{view} view · {selectedDate}</h3>
      {!items.length ? <div className="empty-state">No events yet for this date.</div> : items.map((item) => <div key={`${item.kind}-${item.id}`} className="list-row"><span>{item.label}</span><span className="chip">{item.kind}</span></div>)}
      {!!unscheduled.length && <>
        <p className="small-title">Unscheduled tasks (drag into this calendar card)</p>
        {unscheduled.map((task) => <div key={task.id} className="list-row" draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', task.id)}><span>{task.title}</span><span className="chip chip-muted">Drag me</span></div>)}
      </>}
    </article>
  </section>;
};
