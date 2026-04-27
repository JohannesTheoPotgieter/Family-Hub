// React hook: tasks owned by the active member + their reward points.
//
// Used by the chore-mode panel. Realtime listener triggers a refetch on
// proposal.applied (assignee swap, due date change) + audit events the
// task-completion flow emits.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../lib/api/client.ts';
import { fetchMemberPoints, fetchTasks, type TaskRow } from '../lib/api/tasks.ts';

export type MyTasksState =
  | { kind: 'loading' }
  | { kind: 'guest' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; tasks: TaskRow[]; pointsTotal: number };

export const useMyTasks = ({
  enabled,
  memberId
}: {
  enabled: boolean;
  memberId?: string;
}): MyTasksState => {
  const [state, setState] = useState<MyTasksState>({ kind: 'loading' });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    if (!memberId) {
      setState({ kind: 'guest' });
      return;
    }
    try {
      const [tasks, points] = await Promise.all([
        fetchTasks({ ownerMemberId: memberId }),
        fetchMemberPoints(memberId)
      ]);
      // Filter to live (non-archived, non-completed) — the Phase 2 store
      // returns archived tasks only when includeArchived=true, but
      // recurring completed tasks roll forward and stay completed=false,
      // so the filter here is mainly defensive.
      const live = tasks.tasks.filter((t) => !t.archived);
      setState({ kind: 'ready', tasks: live, pointsTotal: points.total });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setState({ kind: 'guest' });
        return;
      }
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Could not load tasks.'
      });
    }
  }, [memberId]);

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
