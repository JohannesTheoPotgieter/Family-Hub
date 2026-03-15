import { useMemo, useState } from 'react';
import type { CalendarEvent } from '../../lib/family-hub/storage';
import { getCalendarMode, getCalendarProviderClients } from '../../integrations/calendar';
import type { NormalizedEvent } from '../../domain/calendar';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Chip } from '../../ui/Chip';
import { Modal } from '../../ui/Modal';
import { Confetti } from '../../ui/Confetti';
import { useToasts } from '../../ui/useToasts';

type CalendarScreenProps = {
  events: CalendarEvent[];
  onAddEvent: (event: Omit<CalendarEvent, 'id'>) => void;
};

type Filter = 'all' | 'internal' | 'google' | 'microsoft' | 'caldav' | 'ics';

const formatDayKey = (date: Date) => date.toISOString().slice(0, 10);
const fmt = (date: Date, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', opts).format(date);
const startWeek = (date: Date) => { const d = new Date(date); const day = d.getDay(); const diff = day === 0 ? -6 : 1 - day; d.setDate(d.getDate() + diff); d.setHours(0,0,0,0); return d; };
const addDays = (date: Date, n: number) => { const d = new Date(date); d.setDate(d.getDate()+n); return d; };

const providerLabel: Record<Filter, string> = {
  all: 'All',
  internal: 'Internal',
  google: 'Google',
  microsoft: 'Outlook',
  caldav: 'Apple',
  ics: 'ICS'
};

export const CalendarScreen = ({ events, onAddEvent }: CalendarScreenProps) => {
  const mode = getCalendarMode();
  const providers = useMemo(() => getCalendarProviderClients(), []);
  const [day, setDay] = useState(new Date());
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(formatDayKey(new Date()));
  const [selectedFilter, setFilter] = useState<Filter>('all');
  const [externalEvents, setExternalEvents] = useState<NormalizedEvent[]>([]);
  const [celebrate, setCelebrate] = useState(false);
  const { push } = useToasts();

  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(startWeek(day), i)), [day]);

  const merged = useMemo(() => {
    const internal = events.map((event) => ({
      id: event.id,
      provider: 'internal' as const,
      title: event.title,
      iso: `${event.date}T12:00:00.000Z`
    }));
    const external = externalEvents.map((event) => ({ id: event.id, provider: event.provider, title: event.title, iso: event.start.iso }));
    return [...internal, ...external];
  }, [events, externalEvents]);

  const selectedDayEvents = merged.filter((event) => formatDayKey(new Date(event.iso)) === formatDayKey(day))
    .filter((event) => selectedFilter === 'all' || event.provider === selectedFilter)
    .sort((a, b) => a.iso.localeCompare(b.iso));

  const connectProvider = async (providerId: string) => {
    const client = providers.find((item) => item.provider === providerId);
    if (!client) return;
    try {
      await client.connect();
      const calendars = await client.listCalendars();
      const now = new Date();
      const timeMinIso = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString();
      const timeMaxIso = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()).toISOString();
      const chunks = await Promise.all(calendars.slice(0, 3).map((calendar) => client.listEvents({ calendarId: calendar.id, timeMinIso, timeMaxIso })));
      const loaded = chunks.flat();
      setExternalEvents((current) => [...current.filter((item) => item.provider !== client.provider), ...loaded]);
      push(`Connected ${providerLabel[providerId as Filter]} Calendar 🎉`);
      if (loaded.length) push('Plans loaded! 🗓️✨');
      setCelebrate(true);
      setTimeout(() => setCelebrate(false), 1200);
    } catch (error) {
      push((error as Error).message);
    }
  };

  return (
    <section className="stack-lg">
      <Confetti active={celebrate} />
      <Card className="stack-sm calendar-hero">
        <p className="eyebrow">Family Planner Quest</p>
        <h2>Pick a day, track the vibe, make a plan 🧭</h2>
        <div className="chip-list">
          {providers.map((provider) => (
            <Chip key={provider.provider} onClick={() => connectProvider(provider.provider)} aria-label={`Connect ${provider.provider}`}>
              Connect {providerLabel[provider.provider as Filter]}
            </Chip>
          ))}
          <Chip>{mode === 'server' ? 'Sync now' : 'Refresh'}</Chip>
        </div>
      </Card>

      <Card className="week-strip">
        {week.map((weekDay) => {
          const key = formatDayKey(weekDay);
          const hasEvents = merged.some((item) => formatDayKey(new Date(item.iso)) === key);
          return (
            <button key={key} className={`calendar-day-chip ${formatDayKey(day) === key ? 'is-active' : ''}`} onClick={() => setDay(weekDay)}>
              <span>{fmt(weekDay, { weekday: 'short' })}</span>
              <strong>{fmt(weekDay, { day: 'numeric' })}</strong>
              {hasEvents ? <i aria-hidden="true">•</i> : null}
            </button>
          );
        })}
      </Card>

      <div className="chip-list">
        {(Object.keys(providerLabel) as Filter[]).map((filter) => (
          <Chip key={filter} className={selectedFilter === filter ? 'is-active' : ''} onClick={() => setFilter(filter)}>
            {providerLabel[filter]}
          </Chip>
        ))}
      </div>

      <Card className="stack-sm">
        <h3>Agenda · {fmt(day, { weekday: 'long', month: 'short', day: 'numeric' })}</h3>
        {selectedDayEvents.length ? selectedDayEvents.map((event) => (
          <article key={`${event.provider}-${event.id}`} className={`event-card provider-${event.provider}`}>
            <p>{event.title}</p>
            <small>{fmt(new Date(event.iso), { hour: 'numeric', minute: '2-digit' })} · {providerLabel[event.provider as Filter] ?? 'Internal'}</small>
          </article>
        )) : (
          <div className="stack-sm">
            <p className="tasks-empty-emoji">🗓️</p>
            <p className="muted">No events yet—let's add a plan!</p>
          </div>
        )}
      </Card>

      <Button className="floating-add" onClick={() => setOpen(true)} aria-label="Add internal event">+</Button>

      <Modal open={open} title="Add to family plan" onClose={() => setOpen(false)}>
        <input value={title} placeholder="Movie night, picnic, dentist..." onChange={(event) => setTitle(event.target.value)} />
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        <div className="task-composer-actions">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => {
            if (!title.trim()) return;
            onAddEvent({ title: title.trim(), date, kind: 'event' });
            push('Added to the plan!');
            setTitle('');
            setOpen(false);
          }}>Save</Button>
        </div>
      </Modal>
    </section>
  );
};
