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

  const effectiveSelectedDate = selectedDate || getTodayIso();

  const dayItems = useMemo(
    () => ({
      events: events.filter((e) => isSameDay(e.date, effectiveSelectedDate)),
      payments: payments.filter((p) => !p.paid && isSameDay(p.dueDate, effectiveSelectedDate))
    }),
    [effectiveSelectedDate, events, payments]
  );

  return (
    <section className="stack">
      <h2>Calendar</h2>
      <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value || getTodayIso())} />
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          onAddEvent(title.trim(), effectiveSelectedDate, 'event');
          setTitle('');
        }}
      >
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add event for selected day" />
        <button type="submit">Add</button>
      </form>
      {dayItems.events.length === 0 && dayItems.payments.length === 0 ? <div className="empty">Nothing scheduled for this day</div> : null}
      {dayItems.events.map((event) => (
        <div key={event.id} className={`card ${event.type === 'appointment' ? 'appointment' : ''}`}>
          <strong>{event.title}</strong>
          <div className="small">{event.type}</div>
        </div>
      ))}
      {dayItems.payments.map((payment) => (
        <div key={payment.id} className="card payment-due">
          <strong>{payment.title}</strong>
          <div className="small">Payment due</div>
        </div>
      ))}
    </section>
  );
};
