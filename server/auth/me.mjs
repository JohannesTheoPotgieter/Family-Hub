// /api/me — single source of truth for the active session payload
// (Phase 0 closeout).
//
// The client calls this on mount to hydrate:
//   - the active family_member
//   - the entitlement snapshot (plan + features + quotas)
//   - public client config (Clerk publishable key, VAPID public key)
//
// Read-only; no permissions check beyond "is the request authenticated".

import { entitlementsFor } from '../billing/entitlements.mjs';

export const buildMePayload = async (ctx) => {
  if (!ctx) return null;
  // ctx.member already carries the resolved family member; we still need
  // the family's plan to compute entitlements. One small read.
  const { getPool } = await import('../db/pool.mjs');
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT plan, name, locale, province FROM families WHERE id = $1 LIMIT 1`,
    [ctx.member.familyId]
  );
  const family = rows[0] ?? { plan: 'free', name: '', locale: 'GLOBAL', province: null };

  return {
    member: {
      id: ctx.member.id,
      familyId: ctx.member.familyId,
      roleKey: ctx.member.roleKey,
      displayName: ctx.member.displayName
    },
    family: {
      id: ctx.member.familyId,
      name: family.name,
      locale: family.locale,
      province: family.province
    },
    entitlements: entitlementsFor(family.plan),
    publicConfig: {
      clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY ?? null,
      vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? null
    }
  };
};
