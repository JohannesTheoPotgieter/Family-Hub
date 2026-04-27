// Server-backed calendar panel (Phase 5 calendar cutover).
//
// Renders the next 14 days from /api/v2/events when the user is
// authenticated. In guest mode returns null so the existing prototype
// CalendarScreen below stays the source of truth.
//
// Two interactions:
//   1. "Discuss" button — POSTs a noop proposal to lazy-create the
//      object thread + drop the user into the chat composer (Phase 5
//      slice 4 will wire the actual ThreadView; for now a console.log
//      proves the flow).
//   2. "Propose move" — opens an inline form, submits an event_move
//      proposal. Realtime fan-out updates the panel within 250ms so the
//      proposal card lands in the inbox without refresh.

import { useMemo, useState } from 'react';
import { useSession } from '../../lib/auth/SessionProvider.tsx';
import { useEvents } from '../../hooks/useEvents.ts';
import { proposeChange, type EventRow } from '../../lib/api/events.ts';

const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-ZA', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });

const formatTime = (iso: string, allDay: boolean) =>
  allDay
    ? 'all day'
    : new Date(iso).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false });

type MoveFormState = {
  eventId: string;
  newStartIso: string;
  newEndIso: string;
};

export const ServerCalendarPanel = () => {
  const session = useSession();
  const enabled = session.kind === 'authenticated';
  const events = useEvents({ enabled });
  const [moveForm, setMoveForm] = useState<MoveFormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const grouped = useMemo(() => {
    if (events.kind !== 'ready') return new Map<string, EventRow[]>();
    const map = new Map<string, EventRow[]>();
    for (const event of events.events) {
      const day = event.start.iso.slice(0, 10);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(event);
    }
    return map;
  }, [events]);

  if (!enabled) return null;
  if (events.kind === 'loading') {
    return <PanelShell>Loading the next two weeks…</PanelShell>;
  }
  if (events.kind === 'guest') return null;
  if (events.kind === 'error') {
    return <PanelShell tone="error">Couldn't load events: {events.message}</PanelShell>;
  }
  if (events.events.length === 0 && events.conflicts.length === 0) {
    return <PanelShell tone="ok">No events in the next two weeks.</PanelShell>;
  }

  const onProposeMove = async (event: EventRow) => {
    setMoveForm({
      eventId: event.id,
      newStartIso: event.start.iso.slice(0, 16),
      newEndIso: event.end.iso.slice(0, 16)
    });
    setFeedback(null);
  };

  const submitMove = async (form: MoveFormState) => {
    setBusy(true);
    setFeedback(null);
    try {
      // The form takes datetime-local values (no timezone). Convert to
      // UTC ISO so the server stores a fully-qualified instant.
      const newStartIso = new Date(form.newStartIso).toISOString();
      const newEndIso = new Date(form.newEndIso).toISOString();
      await proposeChange({
        change: { kind: 'event_move', newStartIso, newEndIso },
        entityId: form.eventId
      });
      setFeedback('Proposal sent — waiting on approvers.');
      setMoveForm(null);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Could not send proposal.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PanelShell>
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 12
        }}
      >
        <strong style={{ fontSize: 16 }}>Next two weeks</strong>
        <span style={{ fontSize: 12, opacity: 0.65 }}>
          {events.events.length} {events.events.length === 1 ? 'event' : 'events'}
          {events.conflicts.length > 0 ? ` · ${events.conflicts.length} conflict${events.conflicts.length === 1 ? '' : 's'}` : ''}
        </span>
      </header>

      {events.conflicts.length > 0 && (
        <div
          style={{
            padding: '8px 12px',
            background: 'rgba(220,53,69,0.08)',
            borderRadius: 12,
            marginBottom: 12,
            fontSize: 13
          }}
        >
          {events.conflicts.map((c, i) => (
            <div key={`${c.a.id}-${c.b.id}-${i}`}>
              ⚠️ {c.a.title ?? 'Event'} clashes with {c.b.title ?? 'Event'}
              {c.sharedAttendeeIds.length > 0 ? ' (same person)' : ''}
            </div>
          ))}
        </div>
      )}

      {feedback && (
        <div style={{ marginBottom: 12, fontSize: 13, opacity: 0.85 }}>{feedback}</div>
      )}

      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[...grouped.entries()].map(([day, dayEvents]) => (
          <li key={day}>
            <div style={{ fontSize: 12, opacity: 0.65, marginBottom: 4 }}>{formatDay(day)}</div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {dayEvents.map((event) => (
                <li
                  key={event.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '8px 12px',
                    background: '#fff',
                    borderRadius: 12,
                    boxShadow: '0 1px 0 rgba(0,0,0,0.04)'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{event.title}</div>
                    <div style={{ fontSize: 12, opacity: 0.65 }}>
                      {formatTime(event.start.iso, event.start.allDay)}
                      {event.location ? ` · ${event.location}` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onProposeMove(event)}
                    disabled={busy}
                    style={ghostButton}
                  >
                    Propose move
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      {moveForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitMove(moveForm);
          }}
          style={{
            marginTop: 12,
            padding: 12,
            background: '#fff',
            borderRadius: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 8
          }}
        >
          <strong style={{ fontSize: 13 }}>Propose new time</strong>
          <label style={{ fontSize: 12, opacity: 0.7 }}>
            Starts
            <input
              type="datetime-local"
              required
              value={moveForm.newStartIso}
              onChange={(e) => setMoveForm({ ...moveForm, newStartIso: e.target.value })}
              style={{ display: 'block', marginTop: 4, padding: 6, width: '100%' }}
            />
          </label>
          <label style={{ fontSize: 12, opacity: 0.7 }}>
            Ends
            <input
              type="datetime-local"
              required
              value={moveForm.newEndIso}
              onChange={(e) => setMoveForm({ ...moveForm, newEndIso: e.target.value })}
              style={{ display: 'block', marginTop: 4, padding: 6, width: '100%' }}
            />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={busy} style={primaryButton}>
              Send proposal
            </button>
            <button
              type="button"
              onClick={() => setMoveForm(null)}
              disabled={busy}
              style={ghostButton}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </PanelShell>
  );
};

const PanelShell = ({
  children,
  tone
}: {
  children: React.ReactNode;
  tone?: 'ok' | 'error';
}) => (
  <section
    aria-label="Server calendar"
    style={{
      padding: 16,
      borderRadius: 16,
      marginBottom: 16,
      background:
        tone === 'error'
          ? 'rgba(220,53,69,0.08)'
          : tone === 'ok'
            ? 'rgba(0,150,80,0.08)'
            : 'rgba(0,0,0,0.03)'
    }}
  >
    {children}
  </section>
);

const primaryButton: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 8,
  border: 'none',
  background: '#1a1a1a',
  color: '#fff',
  cursor: 'pointer',
  fontSize: 13
};

const ghostButton: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 8,
  border: '1px solid rgba(0,0,0,0.15)',
  background: '#fff',
  color: '#1a1a1a',
  cursor: 'pointer',
  fontSize: 13
};
