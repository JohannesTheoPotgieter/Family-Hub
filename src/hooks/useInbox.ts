// React hook: Decision Inbox data + realtime updates (Phase 5).
//
// On mount: fetch the inbox once; subscribe to the SessionProvider's
// `familyhub:realtime` window event and refetch on relevant types
// (message, proposal.created, proposal.applied, audit). Uses a small
// debounce so a burst of updates triggers one refetch.

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchInbox, type InboxPayload } from '../lib/api/inbox.ts';
import { ApiError } from '../lib/api/client.ts';

export type InboxState =
  | { kind: 'loading' }
  | { kind: 'guest' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; payload: InboxPayload };

export const useInbox = ({ enabled }: { enabled: boolean }): InboxState => {
  const [state, setState] = useState<InboxState>({ kind: 'loading' });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const payload = await fetchInbox();
      setState({ kind: 'ready', payload });
    } catch (err) {
      // 401 → caller is in guest mode; avoid logging an error.
      if (err instanceof ApiError && err.status === 401) {
        setState({ kind: 'guest' });
        return;
      }
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Could not load the inbox.'
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
      if (
        t === 'message' ||
        t === 'proposal.created' ||
        t === 'proposal.applied' ||
        t === 'proposal.countered' ||
        t === 'audit'
      ) {
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
