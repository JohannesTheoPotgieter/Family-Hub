// Plan → entitlements map (Phase 0.6).
//
// Single source of truth for "what does this plan unlock?" The same shape
// powers the client `useEntitlement(feature)` hook so paywall decisions
// are server-truthed but rendered without a network call.
//
// Pricing (ZAR-native, monthly, see plan §Monetization):
//   free          R0    up to 4 members
//   family        R149  up to 6 members
//   family_pro    R299  up to 8 members

export const PLANS = ['free', 'family', 'family_pro'];

const FEATURES = {
  // Always on — listed for completeness so client code doesn't have to
  // special-case "this isn't in the map".
  calendar_local: { free: true, family: true, family_pro: true },
  tasks: { free: true, family: true, family_pro: true },
  chat: { free: true, family: true, family_pro: true },
  manual_money: { free: true, family: true, family_pro: true },
  ics_import: { free: true, family: true, family_pro: true },

  // Family + above
  calendar_two_way_sync: { free: false, family: true, family_pro: true },
  push_reminders: { free: false, family: true, family_pro: true },
  voice_input: { free: false, family: true, family_pro: true },
  csv_ofx_import: { free: false, family: true, family_pro: true },

  // Pro only
  bank_linking: { free: false, family: false, family_pro: true },
  debt_coach: { free: false, family: false, family_pro: true },
  spending_insights: { free: false, family: false, family_pro: true },
  multi_currency: { free: false, family: false, family_pro: true },
  receipt_scanning: { free: false, family: false, family_pro: true },
  loadshedding_overlay: { free: false, family: false, family_pro: true }
};

const QUOTAS = {
  free: { maxMembers: 4, photoStorageMb: 200, aiParseDaily: 60 },
  family: { maxMembers: 6, photoStorageMb: 5_000, aiParseDaily: 300 },
  family_pro: { maxMembers: 8, photoStorageMb: 50_000, aiParseDaily: 600 }
};

export const isPlan = (value) => PLANS.includes(value);

/**
 * @param {string} plan
 * @param {string} feature
 */
export const planAllows = (plan, feature) => {
  if (!isPlan(plan)) return false;
  const row = FEATURES[feature];
  if (!row) return false;
  return Boolean(row[plan]);
};

/**
 * @param {string} plan
 */
export const quotasFor = (plan) => QUOTAS[plan] ?? QUOTAS.free;

/**
 * Snapshot of every entitlement for a plan — used by the server to render
 * `entitlements` into the session payload, which the client `useEntitlement`
 * hook reads from.
 *
 * @param {string} plan
 */
export const entitlementsFor = (plan) => {
  const safe = isPlan(plan) ? plan : 'free';
  const flags = {};
  for (const feature of Object.keys(FEATURES)) flags[feature] = planAllows(safe, feature);
  return { plan: safe, features: flags, quotas: quotasFor(safe) };
};
