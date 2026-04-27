// Load the active family roster — used by proposalEngine + future routes
// that need to compute requiredApprovers without round-tripping through the
// client. Tenant-scoped; RLS does the filtering.

import { withFamilyContext } from '../db/pool.mjs';

export const loadFamilyMembers = async (familyId) =>
  withFamilyContext(familyId, async (client) => {
    const { rows } = await client.query(
      `SELECT id, role_key, display_name FROM family_members WHERE status = 'active'`
    );
    return rows.map((row) => ({
      id: row.id,
      roleKey: row.role_key,
      displayName: row.display_name
    }));
  });
