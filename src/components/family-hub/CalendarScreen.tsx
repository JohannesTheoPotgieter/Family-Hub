import { useEffect, useMemo, useState } from 'react';
import type { CalendarEvent } from '../../lib/family-hub/storage';
import { getCalendarMode, getCalendarProviderClients, hasCalendarOAuthConfig } from '../../integrations/calendar';
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
type CalendarView = 'day' | 'week' | 'month';
type ConnectStep = 'choose' | 'google-popup' | 'microsoft-popup' | 'apple-ics' | 'manual-token';

type DisplayEvent = {
  id: string;
  provider: Filter;
  title: string;
  iso: string;
  allDay: boolean;
  dayKey: string;
  timeLabel: string;
  sourceLabel: string;
  familyLabel: string;
};

const formatDayKey = (date: Date) => date.toISOString().slice(0, 10);
const fmt = (date: Date, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', opts).format(date);
const startWeek = (date: Date) => {
  const next = new Date(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  next.setHours(0, 0, 0, 0);
  return next;
};
const startMonth = (date: Date) => {
  const next = new Date(date.getFullYear(), date.getMonth(), 1);
  next.setHours(0, 0, 0, 0);
  return next;
};
const endMonth = (date: Date) => {
  const next = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  next.setHours(23, 59, 59, 999);
  return next;
};
const addDays = (date: Date, n: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + n);
  return next;
};
const isSameDay = (a: Date, b: Date) => formatDayKey(a) === formatDayKey(b);
const isSameMonth = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

const providerLabel: Record<Filter, string> = {
  all: 'All',
  internal: 'Family',
  google: 'Google',
  microsoft: 'Outlook',
  ics: 'ICS'
};

const providerToneLabel: Record<Filter, string> = {
  all: 'Everything',
  internal: 'Family plan',
  google: 'Google calendar',
  microsoft: 'Outlook calendar',
  ics: 'ICS feed'
};

const formatLastSynced = (value?: string) =>
  value ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)) : 'Not synced yet';

const eventTimeLabel = (iso: string, allDay: boolean) => (allDay ? 'All day' : fmt(new Date(iso), { hour: 'numeric', minute: '2-digit' }));

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
  const [view, setView] = useState<CalendarView>('week');
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(formatDayKey(new Date()));
  const [selectedFilter, setFilter] = useState<Filter>('all');
  const [celebrate, setCelebrate] = useState(false);
  const [syncingProvider, setSyncingProvider] = useState<Provider | null>(null);
  const [busyMessage, setBusyMessage] = useState('');
  const [statusError, setStatusError] = useState('');
  const [lastSyncedProvider, setLastSyncedProvider] = useState<Provider | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [connectStep, setConnectStep] = useState<ConnectStep>('choose');
  const [connectProvider, setConnectProvider] = useState<Provider | null>(null);
  const [connectStatus, setConnectStatus] = useState('');
  const [connectError, setConnectError] = useState('');
  const [icsName, setIcsName] = useState('');
  const [icsUrl, setIcsUrl] = useState('');
  const [manualToken, setManualToken] = useState('');
  const { push } = useToasts();

  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(startWeek(day), i)), [day]);
  const monthAnchor = useMemo(() => startMonth(day), [day]);
  const monthGrid = useMemo(() => {
    const monthStart = startMonth(day);
    const gridStart = startWeek(monthStart);
    return Array.from({ length: 35 }, (_, i) => addDays(gridStart, i));
  }, [day]);

  const merged = useMemo<DisplayEvent[]>(() => {
    const internal = internalEvents.map((event) => {
      const iso = `${event.date}T12:00:00.000Z`;
      return {
        id: event.id,
        provider: 'internal' as const,
        title: event.title,
        iso,
        allDay: true,
        dayKey: event.date,
        timeLabel: eventTimeLabel(iso, true),
        sourceLabel: 'Family plan',
        familyLabel: 'Everyone'
      };
    });
    const external = externalEvents.map((event) => ({
      id: event.id,
      provider: event.provider as Filter,
      title: event.title,
      iso: event.start.iso,
      allDay: event.start.allDay,
      dayKey: formatDayKey(new Date(event.start.iso)),
      timeLabel: eventTimeLabel(event.start.iso, event.start.allDay),
      sourceLabel: providerToneLabel[event.provider as Filter] ?? 'Connected calendar',
      familyLabel: calendars.find((calendar) => calendar.id === event.calendarId)?.name ?? 'Connected calendar'
    }));
    return [...internal, ...external].sort((a, b) => a.iso.localeCompare(b.iso));
  }, [calendars, externalEvents, internalEvents]);

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

  const filteredEvents = useMemo(
    () => merged.filter((event) => selectedFilter === 'all' || event.provider === selectedFilter),
    [merged, selectedFilter]
  );

  const selectedDayEvents = useMemo(
    () => filteredEvents.filter((event) => event.dayKey === formatDayKey(day)),
    [day, filteredEvents]
  );

  const weekEvents = useMemo(
    () => week.map((weekDay) => ({ day: weekDay, events: filteredEvents.filter((event) => event.dayKey === formatDayKey(weekDay)) })),
    [filteredEvents, week]
  );

  const agendaSummary = useMemo(() => ({
    total: merged.length,
    today: merged.filter((event) => event.dayKey === formatDayKey(new Date())).length,
    connectedSources: providerSummaries.filter((item) => item.calendarCount > 0 || item.eventCount > 0).length,
    familyEvents: internalEvents.length
  }), [internalEvents.length, merged, providerSummaries]);

  const monthSummary = useMemo(() => {
    const monthEvents = filteredEvents.filter((event) => {
      const eventDate = new Date(event.iso);
      return eventDate >= monthAnchor && eventDate <= endMonth(day);
    });
    return {
      total: monthEvents.length,
      busiestDay: monthGrid.reduce<{ label: string; count: number }>((best, gridDay) => {
        const count = filteredEvents.filter((event) => event.dayKey === formatDayKey(gridDay)).length;
        if (count > best.count) return { label: fmt(gridDay, { month: 'short', day: 'numeric' }), count };
        return best;
      }, { label: 'No busy day yet', count: 0 })
    };
  }, [day, filteredEvents, monthAnchor, monthGrid]);

  const quickAdd = () => {
    if (!title.trim() || !canEditCalendar) return;
    onAddEvent({ title: title.trim(), date, kind: 'event' });
    push('Added to the family plan.');
    setTitle('');
    setDate(formatDayKey(day));
    setOpen(false);
    setView('day');
  };

  const shiftRange = (direction: -1 | 1) => {
    if (view === 'day') setDay((current) => addDays(current, direction));
    if (view === 'week') setDay((current) => addDays(current, direction * 7));
    if (view === 'month') setDay((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1));
  };

  const rangeLabel = useMemo(() => {
    if (view === 'day') return fmt(day, { weekday: 'long', month: 'long', day: 'numeric' });
    if (view === 'week') {
      const start = startWeek(day);
      const end = addDays(start, 6);
      return `${fmt(start, { month: 'short', day: 'numeric' })} – ${fmt(end, { month: start.getMonth() === end.getMonth() ? undefined : 'short', day: 'numeric' })}`;
    }
    return fmt(day, { month: 'long', year: 'numeric' });
  }, [day, view]);

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

  const openConnectModal = () => {
    setConnectOpen(true);
    setConnectStep('choose');
    setConnectProvider(null);
    setConnectStatus('');
    setConnectError('');
    setIcsName('');
    setIcsUrl('');
    setManualToken('');
  };

  const closeConnectModal = () => {
    setConnectOpen(false);
    setConnectStep('choose');
    setConnectProvider(null);
    setConnectStatus('');
    setConnectError('');
  };

  const handlePopupConnect = async (providerId: 'google' | 'microsoft') => {
    const client = providers.find((item) => item.provider === providerId);
    if (!client) return;
    try {
      setConnectError('');
      setConnectStatus(`Opening ${client.label} sign-in…`);
      await client.connect();
      setConnectStatus(`${client.label} connected. Syncing…`);
      await syncProvider(providerId);
      closeConnectModal();
    } catch (error) {
      const message = (error as Error).message;
      setConnectError(message);
      push(message);
    } finally {
      setConnectStatus('');
    }
  };

  const handleProviderClick = (providerId: 'google' | 'microsoft' | 'apple') => {
    if (!canConnectCalendar) {
      push('Only adult profiles can connect calendars.');
      return;
    }

    setConnectError('');
    setConnectStatus('');

    if (providerId === 'apple') {
      setConnectProvider('ics');
      setConnectStep('apple-ics');
      return;
    }

    setConnectProvider(providerId);
    setConnectStep(providerId === 'google' ? 'google-popup' : 'microsoft-popup');
    if (hasCalendarOAuthConfig(providerId)) {
      void handlePopupConnect(providerId);
    }
  };

  const handleManualTokenConnect = async () => {
    if (connectProvider !== 'google' && connectProvider !== 'microsoft') return;
    const client = providers.find((item) => item.provider === connectProvider);
    if (!client) return;
    try {
      setConnectError('');
      setConnectStatus(`Connecting ${client.label}…`);
      await client.connect({ accessToken: manualToken });
      await syncProvider(connectProvider);
      closeConnectModal();
    } catch (error) {
      const message = (error as Error).message;
      setConnectError(message);
      push(message);
    } finally {
      setConnectStatus('');
    }
  };

  const handleIcsConnect = async () => {
    if (!canConnectCalendar) {
      push('Only adult profiles can connect calendars.');
      return;
    }
    const client = providers.find((item) => item.label === 'Apple Calendar') ?? providers.find((item) => item.provider === 'ics');
    if (!client) return;
    try {
      setConnectError('');
      setConnectStatus('Adding calendar…');
      await client.connect({ name: icsName || 'Apple Calendar', url: icsUrl });
      await syncProvider('ics');
      closeConnectModal();
    } catch (error) {
      const message = (error as Error).message;
      setConnectError(message);
      push(message);
    } finally {
      setConnectStatus('');
    }
  };

  useEffect(() => {
    setDate(formatDayKey(day));
  }, [day]);

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

      <Card className="stack-md calendar-hero calendar-planner-shell">
        <div className="calendar-hero-top">
          <div>
            <p className="eyebrow">Family planner</p>
            <h2>A calmer calendar for family life.</h2>
            <p className="muted calendar-hero-copy">
              See what matters today, switch views quickly, and add plans in seconds without losing connected calendars.
            </p>
          </div>
          <span className="route-pill">{agendaSummary.connectedSources} connected source{agendaSummary.connectedSources === 1 ? '' : 's'}</span>
        </div>

        <div className="calendar-summary-grid calendar-summary-grid--hero">
          <article className="calendar-summary-card">
            <span className="metric-label">Today</span>
            <strong>{agendaSummary.today}</strong>
            <small>{agendaSummary.today === 1 ? 'event scheduled' : 'events scheduled'}</small>
          </article>
          <article className="calendar-summary-card">
            <span className="metric-label">Family plans</span>
            <strong>{agendaSummary.familyEvents}</strong>
            <small>shared with everyone</small>
          </article>
          <article className="calendar-summary-card">
            <span className="metric-label">This month</span>
            <strong>{monthSummary.total}</strong>
            <small>{monthSummary.busiestDay.count ? `${monthSummary.busiestDay.label} is busiest` : 'No crowded days yet'}</small>
          </article>
        </div>

        {statusError ? <div className="error-banner">{statusError}</div> : null}
        {busyMessage ? <div className="status-banner">{busyMessage}</div> : null}

        <div className="calendar-quick-add">
          <div className="calendar-quick-add__intro">
            <p className="eyebrow">Quick add</p>
            <strong>Make event creation feel instant.</strong>
            <span>Best for school pickups, movie nights, dinners, or anything the whole family should see.</span>
          </div>
          <div className="calendar-quick-add__fields">
            <input
              value={title}
              placeholder="Add a family plan…"
              onChange={(event) => setTitle(event.target.value)}
              disabled={!canEditCalendar}
              aria-label="Event title"
            />
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} disabled={!canEditCalendar} aria-label="Event date" />
            <Button onClick={quickAdd} disabled={!title.trim() || !canEditCalendar}>Quick add</Button>
            <Button variant="ghost" onClick={() => setOpen(true)} disabled={!canEditCalendar}>More details</Button>
          </div>
        </div>
      </Card>

      <Card className="stack-md calendar-planner-shell">
        <div className="calendar-toolbar calendar-toolbar--planner">
          <div className="calendar-toolbar__main">
            <div>
              <p className="eyebrow">Browse schedule</p>
              <h3>{rangeLabel}</h3>
            </div>
            <div className="calendar-nav-row">
              <Button variant="ghost" onClick={() => shiftRange(-1)} aria-label="Previous range">←</Button>
              <Button variant="ghost" onClick={() => setDay(new Date())}>Today</Button>
              <Button variant="ghost" onClick={() => shiftRange(1)} aria-label="Next range">→</Button>
            </div>
          </div>

          <div className="calendar-view-tabs calendar-view-tabs--mobile-friendly" role="tablist" aria-label="Calendar view">
            {(['day', 'week', 'month'] as CalendarView[]).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={view === value}
                className={`calendar-view-tab ${view === value ? 'is-active' : ''}`}
                onClick={() => setView(value)}
              >
                {value}
              </button>
            ))}
          </div>

          <div className="calendar-filter-row calendar-filter-row--planner" aria-label="Calendar source filter">
            {availableFilters.map((filter) => (
              <Chip key={filter} className={selectedFilter === filter ? 'is-active' : ''} onClick={() => setFilter(filter)}>
                {providerLabel[filter]}
              </Chip>
            ))}
          </div>
        </div>

        {view === 'day' ? (
          <div className="calendar-agenda-layout">
            <Card className="stack-sm calendar-focus-card">
              <div className="section-head section-head--tight">
                <div>
                  <p className="eyebrow">Focused day</p>
                  <h3>{fmt(day, { weekday: 'long', month: 'short', day: 'numeric' })}</h3>
                </div>
                <span className="section-tip">{selectedDayEvents.length} item{selectedDayEvents.length === 1 ? '' : 's'}</span>
              </div>
              {selectedDayEvents.length ? selectedDayEvents.map((event) => (
                <article key={`${event.provider}-${event.id}`} className={`calendar-event-card provider-${event.provider}`}>
                  <div className="calendar-event-card__top">
                    <span className={`calendar-provider-pill provider-${event.provider}`}>{event.sourceLabel}</span>
                    <span className="calendar-event-time">{event.timeLabel}</span>
                  </div>
                  <strong>{event.title}</strong>
                  <div className="calendar-event-meta">
                    <span>{event.familyLabel}</span>
                    <span>{providerToneLabel[event.provider]}</span>
                  </div>
                </article>
              )) : (
                <div className="calendar-empty-state">
                  <p className="tasks-empty-emoji">✨</p>
                  <strong>Nothing scheduled yet.</strong>
                  <p className="muted">Use quick add to capture a plan fast, or connect a calendar below.</p>
                </div>
              )}
            </Card>

            <Card className="stack-sm calendar-focus-card calendar-focus-card--side">
              <div className="section-head section-head--tight">
                <div>
                  <p className="eyebrow">Family visibility</p>
                  <h3>What everyone can see</h3>
                </div>
              </div>
              <div className="calendar-legend-list">
                <div className="calendar-legend-item"><span className="calendar-provider-pill provider-internal">Family plan</span><p>Shared plans are always highlighted first so coordination is obvious.</p></div>
                <div className="calendar-legend-item"><span className="calendar-provider-pill provider-google">Google</span><p>Connected calendars stay visible, but secondary to the family plan.</p></div>
                <div className="calendar-legend-item"><span className="calendar-provider-pill provider-microsoft">Outlook</span><p>Each event shows its source and connected calendar name for clarity.</p></div>
              </div>
            </Card>
          </div>
        ) : null}

        {view === 'week' ? (
          <div className="calendar-week-board">
            {weekEvents.map(({ day: weekDay, events }) => (
              <button
                key={formatDayKey(weekDay)}
                type="button"
                className={`calendar-week-column ${isSameDay(day, weekDay) ? 'is-active' : ''}`}
                onClick={() => setDay(weekDay)}
              >
                <div className="calendar-week-column__header">
                  <span>{fmt(weekDay, { weekday: 'short' })}</span>
                  <strong>{fmt(weekDay, { day: 'numeric' })}</strong>
                </div>
                <div className="calendar-week-column__body">
                  {events.length ? events.slice(0, 4).map((event) => (
                    <span key={`${event.provider}-${event.id}`} className={`calendar-item-chip provider-${event.provider}`}>
                      {event.timeLabel} · {event.title}
                    </span>
                  )) : <span className="calendar-week-column__empty">Free day</span>}
                  {events.length > 4 ? <span className="calendar-more">+{events.length - 4} more</span> : null}
                </div>
              </button>
            ))}
          </div>
        ) : null}

        {view === 'month' ? (
          <div className="calendar-month-grid" role="grid" aria-label="Month view">
            {monthGrid.map((gridDay) => {
              const dayEvents = filteredEvents.filter((event) => event.dayKey === formatDayKey(gridDay));
              return (
                <button
                  key={formatDayKey(gridDay)}
                  type="button"
                  role="gridcell"
                  className={`calendar-day-cell ${isSameDay(day, gridDay) ? 'is-selected' : ''} ${isSameMonth(gridDay, day) ? '' : 'is-outside'}`}
                  onClick={() => {
                    setDay(gridDay);
                    setView('day');
                  }}
                >
                  <div className="calendar-day-cell__header">
                    <span className="calendar-day-number">{fmt(gridDay, { day: 'numeric' })}</span>
                    {dayEvents.length ? <span className="calendar-day-count">{dayEvents.length}</span> : null}
                  </div>
                  <div className="calendar-mini-list">
                    {dayEvents.slice(0, 3).map((event) => (
                      <span key={`${event.provider}-${event.id}`} className={`calendar-dot provider-${event.provider}`}>{event.title}</span>
                    ))}
                    {!dayEvents.length ? <span className="calendar-week-column__empty">No plans</span> : null}
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}
      </Card>

      <Card className="stack-sm calendar-planner-shell">
        <div className="section-head section-head--tight">
          <div>
            <p className="eyebrow">Connected calendars</p>
            <h3>Keep outside events in sync</h3>
          </div>
          <span className="section-tip">Optional</span>
        </div>
        <p className="muted">Advanced setup stays separate so the main planner stays clean and easy for the whole family.</p>
        <div className="chip-list calendar-action-row">
          <Chip onClick={openConnectModal} aria-label="Connect calendar">
            Connect calendar
          </Chip>
          <Chip onClick={() => void syncAllProviders()}>
            Sync all
          </Chip>
          <Chip onClick={() => void (lastSyncedProvider ? syncProvider(lastSyncedProvider) : push('Connect a calendar first.'))}>
            {syncingProvider ? 'Syncing…' : 'Refresh'}
          </Chip>
        </div>
        {providerSummaries.some((item) => item.calendarCount > 0 || item.eventCount > 0) ? providerSummaries.map((summary) => (
          <article key={summary.provider} className="calendar-source-card">
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
        )) : <div className="calendar-empty-state calendar-empty-state--compact"><strong>No calendars connected.</strong><p className="muted">Connect Google, Outlook, or an ICS feed when you want outside events to appear in Family Hub.</p></div>}
      </Card>

      <Modal open={open} title="Add to family plan" onClose={() => setOpen(false)}>
        <p className="muted">Add a simple family event that everyone can see at a glance.</p>
        <input value={title} placeholder="Movie night, picnic, dentist..." onChange={(event) => setTitle(event.target.value)} />
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        <div className="task-composer-actions">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!title.trim() || !canEditCalendar} onClick={quickAdd}>Save</Button>
        </div>
      </Modal>

      <Modal open={connectOpen} title="Add a calendar" onClose={closeConnectModal}>
        {connectError ? <div className="error-banner">{connectError}</div> : null}
        {connectStatus ? <div className="status-banner">{connectStatus}</div> : null}

        {connectStep === 'choose' ? (
          <>
            <div className="provider-card-grid">
              {[
                { id: 'google', label: 'Google', icon: '🗓️', sub: 'Gmail & Workspace' },
                { id: 'microsoft', label: 'Outlook', icon: '📅', sub: 'Microsoft 365' },
                { id: 'apple', label: 'Apple', icon: '🍎', sub: 'iCloud & iOS' }
              ].map((provider) => (
                <button key={provider.id} className="provider-card" type="button" onClick={() => handleProviderClick(provider.id as 'google' | 'microsoft' | 'apple')}>
                  <span className="provider-card-icon">{provider.icon}</span>
                  <span className="provider-card-label">{provider.label}</span>
                  <span className="provider-card-sub">{provider.sub}</span>
                </button>
              ))}
            </div>
            <div className="provider-divider">
              <span>or paste an ICS / CalDAV link</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={icsUrl} placeholder="webcal:// or https://" onChange={(event) => setIcsUrl(event.target.value)} />
              <Button onClick={() => void handleIcsConnect()} disabled={!icsUrl.trim()}>Add</Button>
            </div>
          </>
        ) : null}

        {(connectStep === 'google-popup' || connectStep === 'microsoft-popup') && connectProvider ? (
          !hasCalendarOAuthConfig(connectProvider as 'google' | 'microsoft') ? (
            <div className="stack-sm">
              <strong>⚙️ One-time setup needed</strong>
              <p className="muted">
                To connect {connectProvider === 'google' ? 'Google Calendar' : 'Outlook Calendar'}, add{' '}
                <code>{connectProvider === 'google' ? 'VITE_GOOGLE_CLIENT_ID' : 'VITE_MICROSOFT_CLIENT_ID'}</code> in Replit Secrets, then redeploy.
              </p>
              <ol className="muted" style={{ paddingLeft: 16, margin: 0 }}>
                <li>Open the provider developer console and create an OAuth app.</li>
                <li>Add your Replit app URL as an authorized origin/redirect.</li>
                <li>Copy the client id to Replit Secrets and redeploy.</li>
              </ol>
              <div className="task-composer-actions">
                <Button variant="ghost" onClick={() => setConnectStep('choose')}>Back</Button>
                <Button variant="ghost" onClick={() => setConnectStep('manual-token')}>Use manual token instead</Button>
              </div>
            </div>
          ) : null
        ) : null}

        {connectStep === 'manual-token' ? (
          <div className="stack-sm">
            <p className="muted">Advanced setup: paste a temporary read-only access token for this browser session.</p>
            <textarea value={manualToken} placeholder="Paste access token" rows={4} onChange={(event) => setManualToken(event.target.value)} />
            <div className="task-composer-actions">
              <Button variant="ghost" onClick={() => setConnectStep('choose')}>Back</Button>
              <Button onClick={() => void handleManualTokenConnect()} disabled={!manualToken.trim()}>Connect token</Button>
            </div>
          </div>
        ) : null}

        {connectStep === 'apple-ics' ? (
          <div className="stack-sm">
            <strong>Connect Apple Calendar</strong>
            <ol className="muted" style={{ paddingLeft: 16, margin: 0 }}>
              <li>Open Calendar on your Mac or iPhone.</li>
              <li>Right-click a calendar and choose Share Calendar.</li>
              <li>Enable Public Calendar and copy the link.</li>
              <li>Paste the webcal:// or https:// link below.</li>
            </ol>
            <input value={icsName} placeholder="Calendar name" onChange={(event) => setIcsName(event.target.value)} />
            <input value={icsUrl} placeholder="webcal:// or https:// link" onChange={(event) => setIcsUrl(event.target.value)} />
            <div className="task-composer-actions">
              <Button variant="ghost" onClick={() => setConnectStep('choose')}>Cancel</Button>
              <Button onClick={() => void handleIcsConnect()} disabled={!icsUrl.trim()}>Connect Apple Calendar</Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </section>
  );
};
