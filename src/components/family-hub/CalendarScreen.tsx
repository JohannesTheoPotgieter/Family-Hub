import { useMemo, useState } from 'react';
import { getTodayIso, isSameDay } from '../../lib/family-hub/date';
import type { Event, Payment } from '../../lib/family-hub/storage';

type Props = {
  events: Event[];
  payments: Payment[];
  onAddEvent: (title: string, date: string, type: Event['type']) => void;
};

export const CalendarScreen = ({ events, payments, onAddEvent }: Props) => {
  const [selectedDate, setSelectedDate] = useState(getTodayIso());
  const [title, setTitle] = useState('');
  const [type, setType] = useState<Event['type']>('event');
  const dayItems = useMemo(() => {
    const dayEvents = events.filter((event) => isSameDay(event.date, selectedDate));
    const dayPayments = payments.filter((payment) => !payment.paid && isSameDay(payment.dueDate, selectedDate));
    return { dayEvents, dayPayments };
  }, [events, payments, selectedDate]);

  return (
    <section className="stack-lg">
      <div className="screen-title"><h2>Calendar</h2><p className="muted">Simple and reliable scheduling.</p></div>
      <article className="glass-card stack">
        <label className="field-label">Selected day</label>
        <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
        <form className="stack" onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          onAddEvent(title.trim(), selectedDate, type);
          setTitle('');
        }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add event" />
          <select value={type} onChange={(e) => setType(e.target.value as Event['type'])}>
            <option value="event">Event</option>
            <option value="appointment">Special appointment</option>
          </select>
          <button className="btn btn-primary" type="submit">Save</button>
        </form>
      </article>
      <article className="stack">
        {dayItems.dayEvents.length === 0 && dayItems.dayPayments.length === 0 ? <div className="glass-card empty-state">No events yet for this date.</div> : null}
        {dayItems.dayEvents.map((event) => <div key={event.id} className={`glass-card list-tile ${event.type === 'appointment' ? 'appointment' : ''}`}><p>{event.title}</p><span className="chip">{event.type}</span></div>)}
        {dayItems.dayPayments.map((payment) => <div key={payment.id} className="glass-card list-tile payment-due"><p>{payment.title}</p><span className="chip">Payment due</span></div>)}
      </article>
    </section>
  );
};
