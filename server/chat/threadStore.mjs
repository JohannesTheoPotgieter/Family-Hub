// Thread metadata reads (Phase 3.6 server).
//
// Most thread mutation lives in the entity stores (ensureEventThread,
// ensureTaskThread). This module exposes the read paths the messages /
// settings / digest routes need: load by id, list visible to a member,
// and direct-thread lookup-or-create between two members.

import { withFamilyContext, withTransaction } from '../db/pool.mjs';

const rowToThread = (row) => ({
  id: row.id,
  familyId: row.family_id,
  kind: row.kind,
  entityKind: row.entity_kind ?? null,
  entityId: row.entity_id ?? null,
  directMemberA: row.direct_member_a ?? null,
  directMemberB: row.direct_member_b ?? null,
  e2eEncrypted: row.e2e_encrypted,
  createdAt: row.created_at
});

export const getThread = async ({ familyId, threadId }) =>
  withFamilyContext(familyId, async (client) => {
    const { rows } = await client.query(`SELECT * FROM threads WHERE id = $1 LIMIT 1`, [threadId]);
    return rows[0] ? rowToThread(rows[0]) : null;
  });

/**
 * Idempotently ensure the singleton family thread exists. Clerk webhook
 * creates one for fresh signups; families seeded via the migration
 * endpoint or imported from a legacy data.json don't go through that
 * path. This helper closes the gap so any code that assumes a family
 * thread exists (push fan-out, decisions digest, audit-card rendering)
 * is safe to call after it.
 */
export const ensureFamilyThread = async ({ familyId }) =>
  withFamilyContext(familyId, (client) =>
    withTransaction(client, async () => {
      const { rows: existing } = await client.query(
        `SELECT * FROM threads WHERE family_id = $1 AND kind = 'family' LIMIT 1`,
        [familyId]
      );
      if (existing.length) return rowToThread(existing[0]);
      const { rows } = await client.query(
        `INSERT INTO threads (family_id, kind, e2e_encrypted) VALUES ($1, 'family', true)
         RETURNING *`,
        [familyId]
      );
      return rowToThread(rows[0]);
    })
  );

/**
 * Threads the active member should see, with `last_read_at` joined in so the
 * client can compute unread counts.
 *
 * Hides:
 *   - direct threads where the active member is neither party
 *   - object threads whose entity has been kid-hidden for this member
 */
export const listVisibleThreads = async ({ familyId, memberId, roleKey }) =>
  withFamilyContext(familyId, async (client) => {
    const { rows } = await client.query(
      `SELECT t.*, s.last_read_at, s.muted_until, s.kid_visible
         FROM threads t
         LEFT JOIN thread_member_settings s
           ON s.thread_id = t.id AND s.member_id = $1
        WHERE (
          t.kind = 'family'
          OR (t.kind = 'direct' AND $1 IN (t.direct_member_a, t.direct_member_b))
          OR t.kind = 'object'
        )
          AND ($2 <> 'child_limited' OR COALESCE(s.kid_visible, true) = true)
        ORDER BY t.created_at DESC`,
      [memberId, roleKey]
    );
    return rows.map((row) => ({
      ...rowToThread(row),
      lastReadAt: row.last_read_at ?? null,
      mutedUntil: row.muted_until ?? null,
      kidVisible: row.kid_visible ?? true
    }));
  });

/**
 * Get-or-create a direct thread between two members. Sorted member ids
 * keep the (a, b) tuple unique per pair (the CHECK constraint in 0001
 * enforces directMemberA < directMemberB).
 */
export const ensureDirectThread = async ({ familyId, memberA, memberB }) => {
  if (memberA === memberB) {
    const err = new Error('direct thread requires two distinct members');
    err.status = 400;
    throw err;
  }
  const [a, b] = [memberA, memberB].sort();
  return withFamilyContext(familyId, (client) =>
    withTransaction(client, async () => {
      const { rows: existing } = await client.query(
        `SELECT * FROM threads
          WHERE family_id = $1 AND kind = 'direct'
            AND direct_member_a = $2 AND direct_member_b = $3
          LIMIT 1`,
        [familyId, a, b]
      );
      if (existing.length) return rowToThread(existing[0]);

      const { rows: inserted } = await client.query(
        `INSERT INTO threads (family_id, kind, direct_member_a, direct_member_b, e2e_encrypted)
         VALUES ($1, 'direct', $2, $3, true)
         RETURNING *`,
        [familyId, a, b]
      );
      return rowToThread(inserted[0]);
    })
  );
};
