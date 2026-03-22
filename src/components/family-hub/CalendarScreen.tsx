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
  canConnectCalendar?: boolean;
  canEditCalendar?: boolean;
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
  onClearProviderData,
  canConnectCalendar = true,
  canEditCalendar = true
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
  const [busyMessage, setBusyMessage] = useState('');
  const [statusError, setStatusError] = useState('');
  const [lastSyncedProvider, setLastSyncedProvider] = useState<Provider | null>(null);
  const [connectModalProvider, setConnectModalProvider] = useState<Provider | null>(null);
  const [accessToken, setAccessToken] = useState('');
  const [connectModalMode, setConnectModalMode] = useState<'oauth' | 'manual'>('oauth');
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

  const agendaSummary = useMemo(() => ({
    total: merged.length,
    today: merged.filter((event) => formatDayKey(new Date(event.iso)) === formatDayKey(new Date())).length,
    connectedSources: providerSummaries.filter((item) => item.calendarCount > 0 || item.eventCount > 0).length
  }), [merged, providerSummaries]);

  const syncProvider = async (providerId: Provider) => {
    const client = providers.find((item) => item.provider === providerId);
    if (!client) return;
    if (!canConnectCalendar && (providerId === 'google' || providerId === 'microsoft' || providerId === 'ics')) {
      setBusyMessage('');
      setSyncingProvider(null);
      push('Only adult profiles can connect calendars.');
      return;
    }
    setSyncingProvider(providerId);
    setBusyMessage(`Syncing ${providerId === 'microsoft' ? 'Outlook' : providerId.toUpperCase()}…`);
    setStatusError('');
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
      const message = (error as Error).message;
      setStatusError(message);
      push(message);
    } finally {
      setBusyMessage('');
      setSyncingProvider(null);
    }
  };

  const syncAllProviders = async () => {
    const connectedProviders = providerSummaries.filter((provider) => provider.calendarCount > 0 || provider.eventCount > 0);
    if (!connectedProviders.length) {
      push(canConnectCalendar ? 'Connect a calendar first.' : 'This profile cannot connect calendars.');
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


    if (providerId === 'ics') {
      if (!canConnectCalendar) { push('Only adult profiles can connect calendars.'); return; }
      setIcsName('');
      setIcsUrl('');
      setConnectModalProvider(providerId);
      return;
    }

    try {
      setStatusError('');
      setBusyMessage(`Connecting ${client.label}…`);
      push(`Opening ${client.label} sign-in…`);
      await client.connect();
      if (mode === 'local') {
        await syncProvider(providerId);
      }
    } catch (error) {
      const message = (error as Error).message;
      if (mode === 'local' && (providerId === 'google' || providerId === 'microsoft') && message === 'oauth_unavailable') {
        setAccessToken('');
        setConnectModalMode('oauth');
        setConnectModalProvider(providerId);
        setBusyMessage('');
        return;
      }
      setStatusError(message);
      push(message);
    } finally {
      setBusyMessage('');
    }
  };

  const submitConnectModal = async () => {
    if (!connectModalProvider) return;
    const client = providers.find((item) => item.provider === connectModalProvider);
    if (!client) return;
    try {
      setStatusError('');
      if (connectModalProvider !== 'ics' && connectModalMode === 'oauth') {
        await connectProvider(connectModalProvider);
        return;
      }
      setBusyMessage(connectModalProvider === 'ics' ? 'Adding ICS subscription…' : `Connecting ${client.label}…`);
      if (connectModalProvider === 'ics') {
        await client.connect({ name: icsName, url: icsUrl });
      } else {
        await client.connect({ accessToken });
      }
      setConnectModalProvider(null);
      await syncProvider(connectModalProvider);
    } catch (error) {
      const message = (error as Error).message;
      setStatusError(message);
      push(message);
    } finally {
      setBusyMessage('');
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
        <div className="calendar-hero-top">
          <div>
            <p className="eyebrow">Family Planner</p>
            <h2>One clear calendar for school runs, appointments, and family time.</h2>
          </div>
          <span className="route-pill">{agendaSummary.connectedSources} connected source{agendaSummary.connectedSources === 1 ? '' : 's'}</span>
        </div>
        <p className="muted">
          {mode === 'server'
            ? 'Server mode lets you connect live calendar providers and ICS subscriptions.'
            : 'Local mode opens secure sign-in when available, and only falls back to a temporary browser-only token if needed.'}
        </p>
        <div className="calendar-summary-grid">
          <article className="calendar-summary-card">
            <span className="metric-label">Events today</span>
            <strong>{agendaSummary.today}</strong>
          </article>
          <article className="calendar-summary-card">
            <span className="metric-label">Upcoming loaded</span>
            <strong>{agendaSummary.total}</strong>
          </article>
          <article className="calendar-summary-card">
            <span className="metric-label">Selected day</span>
            <strong>{selectedDayEvents.length}</strong>
          </article>
        </div>
        {statusError ? <div className="error-banner">{statusError}</div> : null}
        {busyMessage ? <div className="status-banner">{busyMessage}</div> : null}
        <div className="chip-list calendar-action-row">
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
        <div className="section-head section-head--tight">
          <div>
            <p className="eyebrow">Connections</p>
            <h3>Connected sources</h3>
          </div>
          <span className="section-tip">Live and manual calendars</span>
        </div>
        {providerSummaries.some((item) => item.calendarCount > 0 || item.eventCount > 0) ? providerSummaries.map((summary) => (
          <article key={summary.provider} className="event-card calendar-source-card">
            <div>
              <p>{summary.label}</p>
              <small>
                {summary.calendarCount} calendar{summary.calendarCount === 1 ? '' : 's'} · {summary.eventCount} event{summary.eventCount === 1 ? '' : 's'} · {formatLastSynced(summary.lastSyncedAtIso)}
              </small>
            </div>
            <div className="chip-list">
              <Chip onClick={() => void syncProvider(summary.provider)}>Sync {summary.label}</Chip>
              {(summary.calendarCount > 0 || summary.eventCount > 0) ? <Chip onClick={() => void clearProvider(summary.provider)}>Clear</Chip> : null}
            </div>
          </article>
        )) : <p className="muted">Connect Google, Outlook, or an ICS feed and the events will stay visible across Home, Calendar, and alerts.</p>}
      </Card>

      <Card className="week-strip stack-sm"><div className="section-head section-head--tight"><div><p className="eyebrow">This week</p><h3>Pick a day</h3></div><span className="section-tip">Tap to focus</span></div>
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

      <div className="chip-list calendar-filter-row">
        {availableFilters.map((filter) => (
          <Chip key={filter} className={selectedFilter === filter ? 'is-active' : ''} onClick={() => setFilter(filter)}>
            {providerLabel[filter]}
          </Chip>
        ))}
      </div>

      <Card className="stack-sm">
        <div className="section-head section-head--tight">
          <div>
            <p className="eyebrow">Agenda</p>
            <h3>{fmt(day, { weekday: 'long', month: 'short', day: 'numeric' })}</h3>
          </div>
          <span className="section-tip">{selectedFilter === 'all' ? 'All calendars' : providerLabel[selectedFilter]}</span>
        </div>
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
          <div className="stack-sm calendar-connect-sheet">
            <div className="calendar-connect-intro">
              <strong>The easiest way is secure sign-in.</strong>
              <p className="muted">Family Hub can open the normal {providerLabel[connectModalProvider as Filter] ?? 'calendar'} sign-in flow when the optional calendar server is set up.</p>
            </div>
            {connectModalMode === 'oauth' ? (
              <div className="stack-sm calendar-connect-option">
                <Button onClick={() => void connectProvider(connectModalProvider as Provider)}>Continue with secure sign-in</Button>
                <button className="btn btn-ghost calendar-link-button" type="button" onClick={() => setConnectModalMode('manual')}>
                  Use a token instead
                </button>
                <p className="muted">If secure sign-in is not configured on this device yet, you can still use a temporary read-only token as a fallback.</p>
              </div>
            ) : (
              <div className="stack-sm calendar-connect-option">
                <p className="muted">Fallback option: paste a temporary read-only access token for this browser session.</p>
                <textarea
                  value={accessToken}
                  placeholder="Paste access token"
                  rows={4}
                  onChange={(event) => setAccessToken(event.target.value)}
                />
                <button className="btn btn-ghost calendar-link-button" type="button" onClick={() => setConnectModalMode('oauth')}>
                  Back to easy sign-in
                </button>
              </div>
            )}
          </div>
        )}
        <div className="task-composer-actions">
          <Button variant="ghost" onClick={() => setConnectModalProvider(null)}>Cancel</Button>
          <Button onClick={() => void submitConnectModal()}>{connectModalProvider === 'ics' ? 'Connect' : connectModalMode === 'manual' ? 'Use token' : 'Done'}</Button>
        </div>
      </Modal>
    </section>
  );
};
