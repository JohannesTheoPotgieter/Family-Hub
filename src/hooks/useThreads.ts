// React hook: all threads visible to the active member.

import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../lib/api/client.ts';
import { fetchThreads, type ThreadRow } from '../lib/api/chat.ts';

export type ThreadsState =
  | { kind: 'loading' }
  | { kind: 'guest' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; threads: ThreadRow[] };

export const useThreads = ({ enabled }: { enabled: boolean }): ThreadsState => {
  const [state, setState] = useState<ThreadsState>({ kind: 'loading' });
  const refresh = useCallback(async () => {
    try {
      const result = await fetchThreads();
      setState({ kind: 'ready', threads: result.threads });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setState({ kind: 'guest' });
        return;
      }
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Could not load threads.'
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

  return state;
};
