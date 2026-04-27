// Auth + tenancy middleware (Phase 0.4 + 0.5).
//
// Route handlers in server/bootstrap/routes.mjs use the helpers below to
// gate mutating endpoints. The pattern is:
//
//   const ctx = await resolveRequestContext(req);
//   if (!ctx) return sendForbidden(res);
//   if (!memberHasPermission(ctx.member.roleKey, 'task_edit')) return sendForbidden(res);
//   await withFamilyContext(ctx.member.familyId, async (client) => { ... });
//
// We deliberately don't ship Express middleware here — the project's HTTP
// layer is hand-rolled (`server/bootstrap/http.mjs`). These are plain
// async helpers that take/return a `RequestContext` so they're trivial to
// test and reuse.

import { verifyRequestSession } from './clerk.mjs';
import { memberHasPermission } from './permissions.mjs';
import { getPool, isPoolConfigured } from '../db/pool.mjs';

/**
 * @typedef {{
 *   userId: string,
 *   member: {
 *     id: string,
 *     familyId: string,
 *     roleKey: 'parent_admin' | 'adult_editor' | 'child_limited',
 *     displayName: string
 *   }
 * }} RequestContext
 */

/**
 * Resolve `req` → `RequestContext` or null.
 *
 * Returns null when:
 *   - Clerk isn't configured (dev / unit-test environments)
 *   - DB isn't configured
 *   - The token is missing / invalid
 *   - The user has no `family_members` row (signup webhook hasn't run yet)
 *
 * Callers treat `null` as 401/403 — choose based on whether anonymous access
 * is acceptable for the route.
 *
 * @returns {Promise<RequestContext | null>}
 */
export const resolveRequestContext = async (req) => {
  if (!isPoolConfigured()) return null;
  const session = await verifyRequestSession(req);
  if (!session) return null;

  const pool = getPool();
  // Resolve member without family scoping (we don't know the family yet).
  // The `app_admin` role bypasses RLS; a stricter setup would temporarily
  // SET LOCAL ROLE. For now assume the connection is the trusted app role
  // configured per docs/phase-0-runbook.md.
  const { rows } = await pool.query(
    `SELECT id, family_id, role_key, display_name
       FROM family_members
      WHERE user_id = $1 AND status = 'active'
      LIMIT 1`,
    [session.userId]
  );
  if (!rows.length) return null;
  const member = rows[0];
  return {
    userId: session.userId,
    member: {
      id: member.id,
      familyId: member.family_id,
      roleKey: member.role_key,
      displayName: member.display_name
    }
  };
};

export const requirePermissionOrFail = (ctx, permission) => {
  if (!ctx) {
    const err = new Error('unauthorized');
    err.status = 401;
    throw err;
  }
  if (!memberHasPermission(ctx.member.roleKey, permission)) {
    const err = new Error('forbidden');
    err.status = 403;
    err.permission = permission;
    throw err;
  }
};
