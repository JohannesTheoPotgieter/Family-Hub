import { useMemo, useState, type DragEvent } from 'react';
import type { UserId } from '../../lib/family-hub/constants';
import type { CalendarEvent, PaymentItem, TaskItem } from '../../lib/family-hub/storage';
import { ScreenIntro } from './BaselineScaffold';

type CalendarScreenProps = {
  activeUserId: UserId;
  events: CalendarEvent[];
  payments: PaymentItem[];
  tasks: TaskItem[];
  onAddEvent: (event: Omit<CalendarEvent, 'id'>) => void;
  onAddPayment: (payment: Omit<PaymentItem, 'id' | 'paid'>) => void;
  onAddTask: (task: Omit<TaskItem, 'id' | 'completed'>) => void;
  onUpdateTask: (id: string, update: Omit<TaskItem, 'id' | 'completed'>) => void;
};

type ViewMode = 'month' | 'week' | 'day' | 'agenda';
type ItemType = 'event' | 'appointment' | 'payment' | 'task';
type AddType = 'event' | 'task' | 'payment';

type CalendarItem = {
  id: string;
  type: ItemType;
  title: string;
  date: string;
  meta?: string;
  rawId: string;
};

const viewModes: { key: ViewMode; label: string }[] = [
  { key: 'month', label: 'Month' },
  { key: 'week', label: 'Week' },
  { key: 'day', label: 'Day' },
  { key: 'agenda', label: 'Agenda' }
];

const addTypes: { key: AddType; label: string }[] = [
  { key: 'event', label: 'Event' },
  { key: 'task', label: 'Task' },
  { key: 'payment', label: 'Payment' }
];

const dateKey = (date: Date) => date.toISOString().slice(0, 10);

const prettyDate = (input: Date | string, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) =>
  new Intl.DateTimeFormat('en-ZA', options).format(new Date(input));

const startOfWeek = (date: Date) => {
  const value = new Date(date);
  const day = value.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  value.setDate(value.getDate() + diff);
  value.setHours(0, 0, 0, 0);
  return value;
};

const isSameDay = (left: Date, right: Date) => dateKey(left) === dateKey(right);

const isSpecialAppointment = (event: CalendarEvent) => {
  if (event.kind === 'appointment') return true;
  return /doctor|dentist|appointment|clinic|checkup/i.test(event.title);
};

export const CalendarScreen = ({
  activeUserId,
  events,
  payments,
  tasks,
  onAddEvent,
  onAddPayment,
  onAddTask,
  onUpdateTask
}: CalendarScreenProps) => {
  const today = useMemo(() => new Date(), []);
  const [activeView, setActiveView] = useState<ViewMode>('month');
  const [currentDate, setCurrentDate] = useState<Date>(today);
  const [selectedDay, setSelectedDay] = useState<Date>(today);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<AddType>('event');
  const [title, setTitle] = useState('');
  const [pickedDate, setPickedDate] = useState(dateKey(today));
  const [amount, setAmount] = useState('');
  const [shared, setShared] = useState(true);
  const [dropTargetDate, setDropTargetDate] = useState<string | null>(null);

  const undatedTasks = useMemo(() => tasks.filter((task) => !task.completed && !task.dueDate), [tasks]);

  const allItems = useMemo<CalendarItem[]>(
    () => [
      ...events.map((event) => ({
        id: `event-${event.id}`,
        rawId: event.id,
        type: (isSpecialAppointment(event) ? 'appointment' : 'event') as ItemType,
        title: event.title,
        date: event.date,
        meta: isSpecialAppointment(event) ? 'Special appointment' : 'Family event'
      })),
      ...payments.map((payment) => ({
        id: `payment-${payment.id}`,
        rawId: payment.id,
        type: 'payment' as const,
        title: payment.title,
        date: payment.dueDate,
        meta: `R${payment.amount.toFixed(2)}`
      })),
      ...tasks
        .filter((task) => task.dueDate)
        .map((task) => ({
          id: `task-${task.id}`,
          rawId: task.id,
          type: 'task' as const,
          title: task.title,
          date: task.dueDate ?? dateKey(today),
          meta: task.shared ? 'Shared task' : 'Personal task'
        }))
    ].sort((a, b) => a.date.localeCompare(b.date)),
    [events, payments, tasks, today]
  );

  const itemsByDate = useMemo(() => {
    const grouped: Record<string, CalendarItem[]> = {};
    for (const item of allItems) {
      grouped[item.date] = grouped[item.date] ? [...grouped[item.date], item] : [item];
    }
    return grouped;
  }, [allItems]);

  const monthDays = useMemo(() => {
    const first = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const start = startOfWeek(first);
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return day;
    });
  }, [currentDate]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(selectedDay);
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return day;
    });
  }, [selectedDay]);

  const selectedItems = itemsByDate[dateKey(selectedDay)] ?? [];
  const agendaItems = useMemo(() => allItems.filter((item) => item.date >= dateKey(today)).slice(0, 20), [allItems, today]);

  const jumpPeriod = (direction: -1 | 1) => {
    const next = new Date(currentDate);
    if (activeView === 'month') next.setMonth(next.getMonth() + direction);
    if (activeView === 'week') next.setDate(next.getDate() + 7 * direction);
    if (activeView === 'day') next.setDate(next.getDate() + direction);
    if (activeView === 'agenda') next.setMonth(next.getMonth() + direction);
    setCurrentDate(next);
    setSelectedDay(next);
  };

  const openAdd = (kind: AddType) => {
    setModalType(kind);
    setPickedDate(dateKey(selectedDay));
    setTitle('');
    setAmount('');
    setShared(true);
    setShowModal(true);
  };

  const submit = () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;

    if (modalType === 'event') {
      onAddEvent({ title: cleanTitle, date: pickedDate, kind: /doctor|dentist|appointment|clinic/i.test(cleanTitle) ? 'appointment' : 'event' });
    }

    if (modalType === 'payment') {
      onAddPayment({ title: cleanTitle, dueDate: pickedDate, amount: Number(amount) || 0, category: 'Other', autoCreateTransaction: true });
    }

    if (modalType === 'task') {
      onAddTask({ title: cleanTitle, dueDate: pickedDate, notes: '', shared, ownerId: activeUserId });
    }

    setShowModal(false);
  };

  const onDropTask = (event: DragEvent<HTMLElement>, targetDate: string) => {
    event.preventDefault();
    const taskId = event.dataTransfer.getData('text/task-id');
    const task = tasks.find((entry) => entry.id === taskId);
    if (!task) return;

    onUpdateTask(task.id, {
      title: task.title,
      dueDate: targetDate,
      notes: task.notes,
      shared: task.shared,
      ownerId: task.ownerId
    });
    setDropTargetDate(null);
  };

  const hasItems = allItems.length > 0;

  return (
    <section className="calendar-screen stack-lg">
      <ScreenIntro badge="Planning" title="Calendar" subtitle="Events, payments, and tasks in one clean family timeline." />

      <section className="glass-panel calendar-toolbar stack-sm">
        <div className="calendar-view-tabs" role="tablist" aria-label="Calendar views">
          {viewModes.map((mode) => (
            <button
              key={mode.key}
              className={`calendar-view-tab ${activeView === mode.key ? 'is-active' : ''}`}
              type="button"
              onClick={() => setActiveView(mode.key)}
            >
              {mode.label}
            </button>
          ))}
        </div>

        <div className="calendar-nav-row">
          <button className="btn btn-ghost" type="button" onClick={() => jumpPeriod(-1)}>
            ←
          </button>
          <p className="calendar-range-label">{prettyDate(currentDate, { month: 'long', year: 'numeric' })}</p>
          <button className="btn btn-ghost" type="button" onClick={() => jumpPeriod(1)}>
            →
          </button>
        </div>

        <div className="calendar-quick-actions">
          {addTypes.map((type) => (
            <button key={type.key} className="chip-action" type="button" onClick={() => openAdd(type.key)}>
              + {type.label}
            </button>
          ))}
        </div>
      </section>

      {undatedTasks.length ? (
        <section className="glass-panel undated-drop-strip stack-sm" aria-label="Undated tasks">
          <header className="section-head">
            <h3>Undated tasks</h3>
            <span className="section-tip">Drag onto a date</span>
          </header>
          <div className="chip-list">
            {undatedTasks.map((task) => (
              <button
                key={task.id}
                className="route-pill undated-task-pill"
                draggable
                type="button"
                onDragStart={(event) => event.dataTransfer.setData('text/task-id', task.id)}
              >
                {task.title}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {activeView === 'month' ? (
        <section className="glass-panel calendar-grid month-grid" aria-label="Month view">
          {monthDays.map((day) => {
            const key = dateKey(day);
            const items = itemsByDate[key] ?? [];
            const inMonth = day.getMonth() === currentDate.getMonth();
            return (
              <article
                key={key}
                className={`calendar-day-cell ${inMonth ? '' : 'is-outside'} ${isSameDay(day, selectedDay) ? 'is-selected' : ''} ${dropTargetDate === key ? 'is-drop-target' : ''}`}
                onClick={() => setSelectedDay(day)}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDropTargetDate(key);
                }}
                onDragLeave={() => setDropTargetDate(null)}
                onDrop={(event) => onDropTask(event, key)}
              >
                <p className="calendar-day-number">{day.getDate()}</p>
                <div className="calendar-mini-list">
                  {items.slice(0, 2).map((item) => (
                    <span key={item.id} className={`calendar-dot is-${item.type}`}>
                      {item.type === 'payment' ? 'R' : item.type === 'task' ? '✓' : '•'} {item.title}
                    </span>
                  ))}
                  {items.length > 2 ? <span className="calendar-more">+{items.length - 2} more</span> : null}
                </div>
              </article>
            );
          })}
        </section>
      ) : null}

      {activeView === 'week' ? (
        <section className="glass-panel calendar-grid week-grid" aria-label="Week view">
          {weekDays.map((day) => {
            const key = dateKey(day);
            return (
              <article key={key} className={`week-day-column ${isSameDay(day, selectedDay) ? 'is-selected' : ''}`} onClick={() => setSelectedDay(day)}>
                <p className="calendar-weekday">{prettyDate(day, { weekday: 'short' })}</p>
                <p className="calendar-day-number">{day.getDate()}</p>
                <div className="stack-sm">
                  {(itemsByDate[key] ?? []).map((item) => (
                    <span key={item.id} className={`calendar-item-chip is-${item.type}`}>
                      {item.title}
                    </span>
                  ))}
                </div>
              </article>
            );
          })}
        </section>
      ) : null}

      {activeView === 'day' ? (
        <section className="glass-panel stack day-view" aria-label="Day view">
          <header className="section-head">
            <h3>{prettyDate(selectedDay, { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
            <span className="section-tip">Focused day view</span>
          </header>
          {selectedItems.length ? (
            selectedItems.map((item) => (
              <article key={item.id} className={`calendar-detail-item is-${item.type}`}>
                <p>{item.title}</p>
                <span>{item.meta}</span>
              </article>
            ))
          ) : (
            <p className="muted">Nothing scheduled for this day yet.</p>
          )}
        </section>
      ) : null}

      {activeView === 'agenda' ? (
        <section className="glass-panel stack" aria-label="Agenda view">
          {agendaItems.length ? (
            agendaItems.map((item) => (
              <article key={item.id} className="list-item">
                <span className={`item-tag is-${item.type === 'appointment' ? 'warn' : item.type === 'task' ? 'task' : 'soft'}`}>
                  {item.type}
                </span>
                <div>
                  <p className="task-title">{item.title}</p>
                  <p className="muted">{prettyDate(item.date)} · {item.meta}</p>
                </div>
              </article>
            ))
          ) : (
            <p className="muted">No upcoming items in agenda.</p>
          )}
        </section>
      ) : null}

      <section className="glass-panel selected-day-panel stack-sm" aria-label="Selected day summary">
        <header className="section-head">
          <h3>{prettyDate(selectedDay, { month: 'long', day: 'numeric', weekday: 'short' })}</h3>
          <span className="section-tip">Selected day</span>
        </header>
        {selectedItems.length ? (
          selectedItems.map((item) => (
            <article key={item.id} className={`calendar-item-chip is-${item.type}`}>
              <strong>{item.title}</strong>
              <small>{item.meta}</small>
            </article>
          ))
        ) : (
          <p className="muted">Tap + Event, + Task, or + Payment to fill this date.</p>
        )}
      </section>

      {!hasItems ? (
        <section className="glass-panel calendar-empty stack" aria-label="Empty calendar">
          <p className="tasks-empty-emoji" aria-hidden="true">🗓️</p>
          <h3>Your calendar is clear</h3>
          <p className="muted">Start with one item and build your family rhythm.</p>
          <div className="task-composer-actions">
            <button className="btn btn-primary" type="button" onClick={() => openAdd('event')}>
              Add event
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => openAdd('task')}>
              Add task
            </button>
          </div>
          <button className="btn btn-ghost" type="button" onClick={() => openAdd('payment')}>
            Add payment
          </button>
        </section>
      ) : null}

      {showModal ? (
        <div className="calendar-modal-backdrop" role="presentation" onClick={() => setShowModal(false)}>
          <section className="glass-panel calendar-modal stack" role="dialog" aria-label={`Add ${modalType}`} onClick={(event) => event.stopPropagation()}>
            <h3>Add {modalType}</h3>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={`Title for this ${modalType}`} />
            <input type="date" value={pickedDate} onChange={(event) => setPickedDate(event.target.value)} />
            {modalType === 'payment' ? (
              <input type="number" min="0" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount" />
            ) : null}
            {modalType === 'task' ? (
              <label className="task-shared-toggle">
                <input type="checkbox" checked={shared} onChange={(event) => setShared(event.target.checked)} />
                <span>Share with everyone</span>
              </label>
            ) : null}
            <div className="task-composer-actions">
              <button className="btn btn-ghost" type="button" onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" type="button" onClick={submit}>
                Save
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
};
