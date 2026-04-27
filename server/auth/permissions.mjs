// Server-side authorization (Phase 0.5).
//
// Mirrors src/config/permissions.ts so the client and server share the same
// role → permission map. Runtime mismatches are caught by
// src/test/permissions-parity.test.mjs.
//
// UI checks become UX hints; this module is the actual security boundary.
// Every mutating route should run through `requirePermission(...)`.

export const FAMILY_ROLES = /** @type {const} */ (['parent_admin', 'adult_editor', 'child_limited']);

/** @typedef {(typeof FAMILY_ROLES)[number]} FamilyRole */

/** @type {Record<FamilyRole, readonly string[]>} */
export const ROLE_PERMISSIONS = {
  parent_admin: [
    'money_view', 'money_edit', 'calendar_connect', 'calendar_edit', 'task_edit', 'task_assign',
    'places_edit', 'pin_manage', 'setup_restart', 'data_export', 'data_reset',
    'proposal_create_event', 'proposal_create_task', 'proposal_create_money',
    'proposal_approve_event', 'proposal_approve_task', 'proposal_approve_money', 'proposal_approve_member'
  ],
  adult_editor: [
    'money_view', 'money_edit', 'calendar_connect', 'calendar_edit', 'task_edit', 'task_assign',
    'places_edit', 'pin_manage', 'setup_restart', 'data_export', 'data_reset',
    'proposal_create_event', 'proposal_create_task', 'proposal_create_money',
    'proposal_approve_event', 'proposal_approve_task', 'proposal_approve_money'
  ],
  child_limited: [
    'calendar_edit', 'task_edit', 'places_edit', 'pin_manage',
    'proposal_create_event', 'proposal_create_task',
    'proposal_approve_task'
  ]
};

/**
 * @param {FamilyRole | null | undefined} roleKey
 * @param {string} permission
 */
export const memberHasPermission = (roleKey, permission) => {
  if (!roleKey) return false;
  const perms = ROLE_PERMISSIONS[roleKey];
  return Array.isArray(perms) && perms.includes(permission);
};

/**
 * Express-style middleware. Expects `req.familyMember` to be populated by the
 * upstream auth bootstrap (Clerk session → family member resolution).
 * Returns 403 if the active member's role does not include `permission`.
 *
 * @param {string} permission
 */
export const requirePermission = (permission) => (req, res, next) => {
  const roleKey = req?.familyMember?.roleKey ?? null;
  if (!memberHasPermission(roleKey, permission)) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'forbidden', permission }));
    return;
  }
  next?.();
};
