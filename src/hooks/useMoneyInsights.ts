// React hook: monthly insights + net-worth from /api/v2/insights and
// /api/v2/net-worth. Refetches on proposal apply (which moves money
// around) or on a real-time message in any money thread.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../lib/api/client.ts';
import { fetchInsights, fetchNetWorth, type MonthlyRollup, type NetWorthPayload } from '../lib/api/money.ts';

export type MoneyState =
  | { kind: 'loading' }
  | { kind: 'guest' }
  | { kind: 'forbidden' } // money_view permission missing (kid by default)
  | { kind: 'error'; message: string }
  | { kind: 'ready'; insights: MonthlyRollup; netWorth: NetWorthPayload };

const currentMonthIso = () => new Date().toISOString().slice(0, 7);

export const useMoneyInsights = ({
  enabled,
  currency = 'ZAR',
  monthIso = currentMonthIso()
}: {
  enabled: boolean;
  currency?: string;
  monthIso?: string;
}): MoneyState => {
  const [state, setState] = useState<MoneyState>({ kind: 'loading' });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [insights, netWorth] = await Promise.all([
        fetchInsights({ month: monthIso, currency }),
        fetchNetWorth({ currency })
      ]);
      setState({ kind: 'ready', insights, netWorth });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) return setState({ kind: 'guest' });
        if (err.status === 403) return setState({ kind: 'forbidden' });
      }
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Could not load money summary.'
      });
    }
  }, [currency, monthIso]);

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
