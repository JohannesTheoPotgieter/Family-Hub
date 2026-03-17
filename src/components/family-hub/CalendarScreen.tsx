import { useEffect, useMemo, useState } from 'react';
import type { CalendarEvent } from '../../lib/family-hub/storage';
import { getCalendarMode, getCalendarProviderClients } from '../../integrations/calendar';
import type { Provider, NormalizedCalendar, NormalizedEvent } from '../../domain/calendar';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Chip } from '../../ui/Chip';
import { Modal } from '../../ui/Modal';
import { Confetti } from '../../ui/Confetti';
import { useToasts } from '../../ui/useToasts';

type CalendarScreenProps = {
  internalEvents: CalendarEvent[];
  externalEvents: NormalizedEvent[];
  calendars: NormalizedCalendar[];
  lastSyncedAtIsoByProvider: Partial<Record<Provider, string>>;
  onAddEvent: (event: Omit<CalendarEvent, 'id'>) => void;
  onSyncProvider: (provider: Provider, calendars: NormalizedCalendar[], events: NormalizedEvent[]) => void;
  onClearProviderData: (provider: Provider) => void;
};

type Filter = 'all' | 'internal' | 'google' | 'microsoft' | 'ics';

const formatDayKey = (date: Date) => date.toISOString().slice(0, 10);
const fmt = (date: Date, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-ZA', opts).format(date);
const startWeek = (date: Date) => {
  const next = new Date(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  next.setHours(0, 0, 0, 0);
  return next;
};
const addDays = (date: Date, n: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + n);
  return next;
};

const providerLabel: Record<Filter, string> = {
  all: 'All',
  internal: 'Internal',
  google: 'Google',
  microsoft: 'Outlook',
  ics: 'ICS'
};

const formatLastSynced = (value?: string) =>
  value ? new Intl.DateTimeFormat('en-ZA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)) : 'Not synced yet';

export const CalendarScreen = ({
  internalEvents,
  externalEvents,
  calendars,
  lastSyncedAtIsoByProvider,
  onAddEvent,
  onSyncProvider,
  onClearProviderData
}: CalendarScreenProps) => {
  const mode = getCalendarMode();
  const providers = useMemo(() => getCalendarProviderClients(), []);
  const [day, setDay] = useState(new Date());
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(formatDayKey(new Date()));
  const [selectedFilter, setFilter] = useState<Filter>('all');
  const [celebrate, setCelebrate] = useState(false);
  const [syncingProvider, setSyncingProvider] = useState<Provider | null>(null);
  const [lastSyncedProvider, setLastSyncedProvider] = useState<Provider | null>(null);
  const [connectModalProvider, setConnectModalProvider] = useState<Provider | null>(null);
  const [accessToken, setAccessToken] = useState('');
  const [icsName, setIcsName] = useState('');
  const [icsUrl, setIcsUrl] = useState('');
  const { push } = useToasts();

  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(startWeek(day), i)), [day]);

  const merged = useMemo(() => {
    const internal = internalEvents.map((event) => ({
      id: event.id,
      provider: 'internal' as const,
      title: event.title,
      iso: `${event.date}T12:00:00.000Z`,
      allDay: false
    }));
    const external = externalEvents.map((event) => ({ id: event.id, provider: event.provider, title: event.title, iso: event.start.iso, allDay: event.start.allDay }));
    return [...internal, ...external];
  }, [internalEvents, externalEvents]);

  const availableFilters = useMemo(
    () => ['all', 'internal', ...providers.map((provider) => provider.provider)] as Filter[],
    [providers]
  );

  const providerSummaries = useMemo(
    () =>
      providers.map((provider) => ({
        provider: provider.provider,
        label: provider.label,
        calendarCount: calendars.filter((calendar) => calendar.provider === provider.provider).length,
        eventCount: externalEvents.filter((event) => event.provider === provider.provider).length,
        lastSyncedAtIso: lastSyncedAtIsoByProvider[provider.provider]
      })),
    [calendars, externalEvents, lastSyncedAtIsoByProvider, providers]
  );

  const selectedDayEvents = merged
    .filter((event) => formatDayKey(new Date(event.iso)) === formatDayKey(day))
    .filter((event) => selectedFilter === 'all' || event.provider === selectedFilter)
    .sort((a, b) => a.iso.localeCompare(b.iso));

  const syncProvider = async (providerId: Provider) => {
    const client = providers.find((item) => item.provider === providerId);
    if (!client) return;
    setSyncingProvider(providerId);
    try {
      const calendars = await client.listCalendars();
      if (!calendars.length) {
        push(`No ${client.label} calendars found yet.`);
        onSyncProvider(providerId, [], []);
        setLastSyncedProvider(providerId);
        return;
      }
      const now = new Date();
      const timeMinIso = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString();
      const timeMaxIso = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()).toISOString();
      const chunks = await Promise.all(
        calendars.map((calendar) => client.listEvents({ calendarId: calendar.id, timeMinIso, timeMaxIso }))
      );
      const loaded = chunks.flat();
      onSyncProvider(providerId, calendars, loaded);
      setLastSyncedProvider(providerId);
      push(`${client.label} synced.`);
      if (loaded.length) push(`Loaded ${loaded.length} events.`);
      setCelebrate(true);
      window.setTimeout(() => setCelebrate(false), 1200);
    } catch (error) {
      push((error as Error).message);
    } finally {
      setSyncingProvider(null);
    }
  };

  const syncAllProviders = async () => {
    const connectedProviders = providerSummaries.filter((provider) => provider.calendarCount > 0 || provider.eventCount > 0);
    if (!connectedProviders.length) {
      push('Connect a calendar first.');
      return;
    }
    for (const provider of connectedProviders) {
      await syncProvider(provider.provider);
    }
  };

  const clearProvider = async (providerId: Provider) => {
    const client = providers.find((item) => item.provider === providerId);
    if (!client) return;
    try {
      await client.disconnect();
    } catch {
      // Keep UX forgiving; we still clear local state below.
    }
    onClearProviderData(providerId);
    if (lastSyncedProvider === providerId) setLastSyncedProvider(null);
    push(`${client.label} connection data cleared from Family Hub.`);
  };

  const connectProvider = async (providerId: Provider) => {
    const client = providers.find((item) => item.provider === providerId);
    if (!client) return;

    if (mode === 'local' && (providerId === 'google' || providerId === 'microsoft')) {
      setAccessToken('');
      setConnectModalProvider(providerId);
      return;
    }

    if (providerId === 'ics') {
      setIcsName('');
      setIcsUrl('');
      setConnectModalProvider(providerId);
      return;
    }

    try {
      if (mode === 'server') {
        push(`Redirecting to ${client.label} sign-in…`);
      }
      await client.connect();
      if (mode === 'local') {
        await syncProvider(providerId);
      }
    } catch (error) {
      push((error as Error).message);
    }
  };

  const submitConnectModal = async () => {
    if (!connectModalProvider) return;
    const client = providers.find((item) => item.provider === connectModalProvider);
    if (!client) return;
    try {
      if (connectModalProvider === 'ics') {
        await client.connect({ name: icsName, url: icsUrl });
      } else {
        await client.connect({ accessToken });
      }
      setConnectModalProvider(null);
      await syncProvider(connectModalProvider);
    } catch (error) {
      push((error as Error).message);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('connected');
    const provider = params.get('provider') as Provider | null;
    if (connected !== '1' || !provider) return;
    if (!providers.some((item) => item.provider === provider)) return;
    void syncProvider(provider);
    params.delete('connected');
    params.delete('provider');
    params.delete('tab');
    const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', next);
  }, [providers]);

  return (
    <section className="stack-lg">
      <Confetti active={celebrate} />
      <Card className="stack-sm calendar-hero">
        <p className="eyebrow">Family Planner</p>
        <h2>Pick a day, plan together, and keep every calendar in one place.</h2>
        <p className="muted">
          {mode === 'server'
            ? 'Server mode lets you connect live calendar providers and ICS subscriptions.'
            : 'Local mode works with pasted access tokens and keeps them in this browser session only.'}
        </p>
        <div className="chip-list">
          {providers.map((provider) => (
            <Chip key={provider.provider} onClick={() => void connectProvider(provider.provider)} aria-label={`Connect ${provider.label}`}>
              Connect {provider.label}
            </Chip>
          ))}
          <Chip onClick={() => void syncAllProviders()}>
            Sync all
          </Chip>
          <Chip onClick={() => void (lastSyncedProvider ? syncProvider(lastSyncedProvider) : push('Connect a calendar first.'))}>
            {syncingProvider ? 'Syncing…' : 'Refresh'}
          </Chip>
        </div>
      </Card>

      <Card className="stack-sm">
        <h3>Connected sources</h3>
        {providerSummaries.some((item) => item.calendarCount > 0 || item.eventCount > 0) ? providerSummaries.map((summary) => (
          <article key={summary.provider} className="event-card">
            <p>{summary.label}</p>
            <small>
              {summary.calendarCount} calendar{summary.calendarCount === 1 ? '' : 's'} · {summary.eventCount} event{summary.eventCount === 1 ? '' : 's'} · {formatLastSynced(summary.lastSyncedAtIso)}
            </small>
            <div className="chip-list">
              <Chip onClick={() => void syncProvider(summary.provider)}>Sync {summary.label}</Chip>
              {(summary.calendarCount > 0 || summary.eventCount > 0) ? <Chip onClick={() => void clearProvider(summary.provider)}>Clear</Chip> : null}
            </div>
          </article>
        )) : <p className="muted">Connect Google, Outlook, or an ICS feed and the events will stay visible across Home, Calendar, and alerts.</p>}
      </Card>

      <Card className="week-strip">
        {week.map((weekDay) => {
          const key = formatDayKey(weekDay);
          const hasEvents = merged.some((item) => formatDayKey(new Date(item.iso)) === key);
          return (
            <button key={key} className={`calendar-day-chip ${formatDayKey(day) === key ? 'is-active' : ''}`} onClick={() => setDay(weekDay)} type="button">
              <span>{fmt(weekDay, { weekday: 'short' })}</span>
              <strong>{fmt(weekDay, { day: 'numeric' })}</strong>
              {hasEvents ? <i aria-hidden="true">•</i> : null}
            </button>
          );
        })}
      </Card>

      <div className="chip-list">
        {availableFilters.map((filter) => (
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
            <small>{event.allDay ? 'All day' : fmt(new Date(event.iso), { hour: 'numeric', minute: '2-digit' })} · {providerLabel[event.provider as Filter] ?? 'Internal'}</small>
          </article>
        )) : (
          <div className="stack-sm">
            <p className="tasks-empty-emoji">🗓️</p>
            <p className="muted">No events yet. Add a plan or connect a calendar.</p>
          </div>
        )}
      </Card>

      <Button className="floating-add" onClick={() => setOpen(true)} aria-label="Add internal event">+</Button>

      <Modal open={open} title="Add to family plan" onClose={() => setOpen(false)}>
        <input value={title} placeholder="Movie night, picnic, dentist..." onChange={(event) => setTitle(event.target.value)} />
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        <div className="task-composer-actions">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={() => {
              if (!title.trim()) return;
              onAddEvent({ title: title.trim(), date, kind: 'event' });
              push('Added to the plan.');
              setTitle('');
              setOpen(false);
            }}
          >
            Save
          </Button>
        </div>
      </Modal>

      <Modal
        open={Boolean(connectModalProvider)}
        title={connectModalProvider === 'ics' ? 'Add ICS subscription' : `Connect ${providerLabel[connectModalProvider as Filter] ?? 'calendar'}`}
        onClose={() => setConnectModalProvider(null)}
      >
        {connectModalProvider === 'ics' ? (
          <>
            <input value={icsName} placeholder="Calendar name" onChange={(event) => setIcsName(event.target.value)} />
            <input value={icsUrl} placeholder="https://example.com/family.ics" onChange={(event) => setIcsUrl(event.target.value)} />
          </>
        ) : (
          <>
            <p className="muted">Paste a temporary read-only access token for this browser session.</p>
            <textarea
              value={accessToken}
              placeholder="Access token"
              rows={4}
              onChange={(event) => setAccessToken(event.target.value)}
            />
          </>
        )}
        <div className="task-composer-actions">
          <Button variant="ghost" onClick={() => setConnectModalProvider(null)}>Cancel</Button>
          <Button onClick={() => void submitConnectModal()}>Connect</Button>
        </div>
      </Modal>
    </section>
  );
};
