// React hook: upcoming events from /api/v2/events with realtime updates.
//
// Mirrors useInbox: fetch on mount, listen to the SessionProvider's
// `familyhub:realtime` window event, refetch on relevant types.
// Dual-mode safe — when not authenticated returns { kind: 'guest' }.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../lib/api/client.ts';
import { fetchConflicts, fetchEvents, type EventRow } from '../lib/api/events.ts';
import type { InboxConflict } from '../lib/api/inbox.ts';

export type EventsState =
  | { kind: 'loading' }
  | { kind: 'guest' }
  | { kind: 'error'; message: string }
  | {
      kind: 'ready';
      events: EventRow[];
      conflicts: InboxConflict[];
      window: { fromIso: string; toIso: string };
    };

const defaultWindow = () => {
  const from = new Date();
  from.setUTCHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + 14);
  return { fromIso: from.toISOString(), toIso: to.toISOString() };
};

export const useEvents = ({ enabled }: { enabled: boolean }): EventsState => {
  const [state, setState] = useState<EventsState>({ kind: 'loading' });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const winRef = useRef(defaultWindow());

  const refresh = useCallback(async () => {
    const { fromIso, toIso } = winRef.current;
    try {
      const [events, conflicts] = await Promise.all([
        fetchEvents(fromIso, toIso),
        fetchConflicts(fromIso, toIso)
      ]);
      setState({
        kind: 'ready',
        events: events.events,
        conflicts: conflicts.conflicts,
        window: { fromIso, toIso }
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setState({ kind: 'guest' });
        return;
      }
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Could not load events.'
      });
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setState({ kind: 'guest' });
      return;
    }
    refresh();
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) return;
    const onEvent = (event: Event) => {
      const detail = (event as CustomEvent).detail as { type?: string } | undefined;
      const t = detail?.type ?? '';
      // Any event mutation invalidates the list; proposal apply may have
      // moved an event, etc.
      if (t.startsWith('proposal.') || t === 'message') {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => refresh(), 250);
      }
    };
    window.addEventListener('familyhub:realtime', onEvent as EventListener);
    return () => {
      window.removeEventListener('familyhub:realtime', onEvent as EventListener);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [enabled, refresh]);

  return state;
};
