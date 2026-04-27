// React hook: a single thread's messages + realtime updates.
//
// Subscribes to familyhub:realtime and prepends new messages whose
// thread_id matches. proposal.applied / countered events trigger a
// full refetch so the proposal card rerenders with the new status.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../lib/api/client.ts';
import { fetchMessages, type MessageRow } from '../lib/api/chat.ts';

export type ThreadMessagesState =
  | { kind: 'loading' }
  | { kind: 'guest' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; messages: MessageRow[] };

export const useThread = ({
  enabled,
  threadId
}: {
  enabled: boolean;
  threadId: string | null;
}): ThreadMessagesState => {
  const [state, setState] = useState<ThreadMessagesState>({ kind: 'loading' });
  const lastThreadIdRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!threadId) return;
    try {
      const result = await fetchMessages(threadId, { limit: 100 });
      setState({ kind: 'ready', messages: result.messages });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setState({ kind: 'guest' });
        return;
      }
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Could not load messages.'
      });
    }
  }, [threadId]);

  useEffect(() => {
    if (!enabled || !threadId) {
      setState({ kind: enabled ? 'loading' : 'guest' });
      return;
    }
    lastThreadIdRef.current = threadId;
    refresh();
  }, [enabled, threadId, refresh]);

  useEffect(() => {
    if (!enabled || !threadId) return;
    const onEvent = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { type?: string; threadId?: string; message?: MessageRow }
        | undefined;
      if (!detail) return;
      if (detail.threadId && detail.threadId !== threadId) return;
      if (detail.type === 'message' && detail.message) {
        setState((prev) =>
          prev.kind === 'ready'
            ? { kind: 'ready', messages: [...prev.messages, detail.message!] }
            : prev
        );
        return;
      }
      if (detail.type?.startsWith('proposal.')) {
        refresh();
      }
    };
    window.addEventListener('familyhub:realtime', onEvent as EventListener);
    return () => window.removeEventListener('familyhub:realtime', onEvent as EventListener);
  }, [enabled, threadId, refresh]);

  return state;
};
