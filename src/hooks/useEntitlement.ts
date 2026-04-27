// Client-side entitlement check (Phase 0.6).
//
// Reads from a server-rendered `entitlements` payload that lives on the
// Family-Hub session. Until the auth + DB stack is wired in dev, the hook
// resolves to a default-free entitlements snapshot via DEFAULT_ENTITLEMENTS
// — that means the prototype keeps rendering as "free tier" and Paywall
// renders correctly without a network call.
//
// When real auth lands, the bootstrap layer calls `setEntitlements(payload)`
// with the snapshot from /api/me; everything else is unchanged.

import { useSyncExternalStore } from 'react';

export type Plan = 'free' | 'family' | 'family_pro';

export type EntitlementsSnapshot = {
  plan: Plan;
  features: Record<string, boolean>;
  quotas: { maxMembers: number; photoStorageMb: number; aiParseDaily: number };
};

export const DEFAULT_ENTITLEMENTS: EntitlementsSnapshot = {
  plan: 'free',
  features: {
    calendar_local: true,
    tasks: true,
    chat: true,
    manual_money: true,
    ics_import: true,
    calendar_two_way_sync: false,
    push_reminders: false,
    voice_input: false,
    csv_ofx_import: false,
    bank_linking: false,
    debt_coach: false,
    spending_insights: false,
    multi_currency: false,
    receipt_scanning: false,
    loadshedding_overlay: false
  },
  quotas: { maxMembers: 4, photoStorageMb: 200, aiParseDaily: 60 }
};

let current: EntitlementsSnapshot = DEFAULT_ENTITLEMENTS;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = () => current;

export const setEntitlements = (next: EntitlementsSnapshot) => {
  current = next;
  for (const listener of listeners) listener();
};

export const useEntitlements = (): EntitlementsSnapshot =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

/**
 * Returns true when the active plan unlocks `feature`. Unknown features
 * resolve to false — safer than silently allowing.
 */
export const useEntitlement = (feature: string): boolean => {
  const snap = useEntitlements();
  return Boolean(snap.features[feature]);
};
