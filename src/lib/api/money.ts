// Typed money insights + net-worth client (Phase 5 money cutover).
//
// Wraps the Phase 4.7 + 4.8 read endpoints — the Money screen surfaces
// these as plain-language "what's spare this month" / "where did the
// money go" panels.

import { apiGet } from './client.ts';

export type RollupCategory = {
  category: string;
  kind: 'inflow' | 'outflow';
  currency: string;
  totalCents: number;
  totalCentsDisplay: number | null;
  txCount: number;
  deltaCents: number;
  deltaPct: number | null;
};

export type MonthlyRollup = {
  monthIso: string;
  displayCurrency: string;
  categories: RollupCategory[];
  summary: {
    inflowCents: number;
    outflowCents: number;
    spareCents: number;
  };
};

export type NetWorthPayload = {
  current: {
    displayCurrency: string;
    assetsCents: number;
    debtsCents: number;
    netCents: number;
  };
  history: Array<{
    snapshotDate: string;
    assetsCents: number;
    debtsCents: number;
    netCents: number;
    currency: string;
  }>;
};

export const fetchInsights = (params: { month?: string; currency?: string } = {}) => {
  const query = new URLSearchParams();
  if (params.month) query.set('month', params.month);
  if (params.currency) query.set('currency', params.currency);
  const suffix = query.toString();
  return apiGet<MonthlyRollup>(`/api/v2/insights${suffix ? `?${suffix}` : ''}`);
};

export const fetchNetWorth = (params: { currency?: string; sinceIso?: string } = {}) => {
  const query = new URLSearchParams();
  if (params.currency) query.set('currency', params.currency);
  if (params.sinceIso) query.set('since', params.sinceIso);
  const suffix = query.toString();
  return apiGet<NetWorthPayload>(`/api/v2/net-worth${suffix ? `?${suffix}` : ''}`);
};
