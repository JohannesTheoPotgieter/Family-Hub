// Messages + reactions DB layer (Phase 3.6 server).
//
// Object threads are server-readable so this store exposes plaintext
// reads/writes for them. Family + direct threads carry ciphertext only —
// the route layer accepts the body_ciphertext bytes verbatim and writes
// them through unchanged. Same module handles both shapes: callers pass
// `bodyText` for plaintext or `bodyCiphertext` (Buffer) for E2E.
//
// Reactions are per (message, member, emoji); inserts are idempotent via
// the composite primary key. Removing a reaction is a DELETE.

import { withFamilyContext, withTransaction } from '../db/pool.mjs';

const rowToMessage = (row) => ({
  id: row.id,
  threadId: row.thread_id,
  authorMemberId: row.author_member_id ?? null,
  kind: row.kind,
  bodyText: row.body_text ?? null,
  bodyCiphertext: row.body_ciphertext ?? null,
  proposalId: row.proposal_id ?? null,
  attachments: row.attachments,
  createdAt: row.created_at
});

/**
 * @param {{
 *   familyId: string,
 *   threadId: string,
 *   limit?: number,
 *   beforeIso?: string | null
 * }} args
 */
export const listMessages = async ({ familyId, threadId, limit = 50, beforeIso = null }) =>
  withFamilyContext(familyId, async (client) => {
    const params = [threadId, limit];
    let where = `thread_id = $1`;
    if (beforeIso) {
      params.push(beforeIso);
      where += ` AND created_at < $${params.length}`;
    }
    const { rows } = await client.query(
      `SELECT * FROM messages WHERE ${where} ORDER BY created_at DESC LIMIT $2`,
      params
    );
    // Reactions joined in a second pass so the inner SELECT stays fast.
    const messageIds = rows.map((r) => r.id);
    const reactions = messageIds.length
      ? (await client.query(
          `SELECT message_id, member_id, emoji FROM reactions WHERE message_id = ANY($1::uuid[])`,
          [messageIds]
        )).rows
      : [];
    const byMessage = new Map();
    for (const r of reactions) {
      if (!byMessage.has(r.message_id)) byMessage.set(r.message_id, []);
      byMessage.get(r.message_id).push({ memberId: r.member_id, emoji: r.emoji });
    }
    // Reverse so callers receive ascending order without re-sorting.
    return rows
      .reverse()
      .map((row) => ({ ...rowToMessage(row), reactions: byMessage.get(row.id) ?? [] }));
  });

/**
 * Insert a plain or proposal/activity message. Routes pass either bodyText
 * or bodyCiphertext (matching the messages CHECK constraint that exactly
 * one is set). The kind is enforced at the API layer so this module
 * stays unopinionated.
 *
 * @param {{
 *   familyId: string,
 *   threadId: string,
 *   authorMemberId: string | null,
 *   kind: 'text' | 'activity' | 'proposal',
 *   bodyText?: string | null,
 *   bodyCiphertext?: Buffer | null,
 *   proposalId?: string | null,
 *   attachments?: unknown[]
 * }} args
 */
export const insertMessage = async ({
  familyId,
  threadId,
  authorMemberId,
  kind,
  bodyText = null,
  bodyCiphertext = null,
  proposalId = null,
  attachments = []
}) =>
  withFamilyContext(familyId, async (client) => {
    const { rows } = await client.query(
      `INSERT INTO messages (
          family_id, thread_id, author_member_id, kind, body_text,
          body_ciphertext, proposal_id, attachments
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
       RETURNING *`,
      [
        familyId,
        threadId,
        authorMemberId,
        kind,
        bodyText,
        bodyCiphertext,
        proposalId,
        JSON.stringify(attachments)
      ]
    );
    return rowToMessage(rows[0]);
  });

/**
 * Replace a message body with a tombstone. Used by the moderation flow:
 * the original ciphertext stays on disk for a parent_admin to review
 * via /api/v2/messages/:id/audit (Phase 3.10), but the chat thread shows
 * "[message hidden by moderation]" in its place.
 */
export const hideMessage = async ({ familyId, messageId, reasons }) =>
  withFamilyContext(familyId, (client) =>
    withTransaction(client, async () => {
      await client.query(
        `UPDATE messages
            SET body_text = '[message hidden by moderation]'
          WHERE id = $1`,
        [messageId]
      );
      await client.query(
        `INSERT INTO audit_log (family_id, action, entity_kind, entity_id, diff)
         VALUES ($1, 'message.moderated', 'message', $2, $3::jsonb)`,
        [familyId, messageId, JSON.stringify({ reasons })]
      );
    })
  );

// --- reactions ----------------------------------------------------------

export const addReaction = async ({ familyId, messageId, memberId, emoji }) =>
  withFamilyContext(familyId, async (client) => {
    await client.query(
      `INSERT INTO reactions (family_id, message_id, member_id, emoji)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [familyId, messageId, memberId, emoji]
    );
  });

export const removeReaction = async ({ familyId, messageId, memberId, emoji }) =>
  withFamilyContext(familyId, async (client) => {
    await client.query(
      `DELETE FROM reactions
        WHERE message_id = $1 AND member_id = $2 AND emoji = $3`,
      [messageId, memberId, emoji]
    );
  });

// --- thread membership + read receipts ---------------------------------

export const markThreadRead = async ({ familyId, threadId, memberId, atIso }) =>
  withFamilyContext(familyId, async (client) => {
    await client.query(
      `INSERT INTO thread_member_settings (family_id, thread_id, member_id, last_read_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (thread_id, member_id) DO UPDATE SET last_read_at = EXCLUDED.last_read_at`,
      [familyId, threadId, memberId, atIso]
    );
  });

export const setThreadMute = async ({ familyId, threadId, memberId, mutedUntilIso }) =>
  withFamilyContext(familyId, async (client) => {
    await client.query(
      `INSERT INTO thread_member_settings (family_id, thread_id, member_id, muted_until)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (thread_id, member_id) DO UPDATE SET muted_until = EXCLUDED.muted_until`,
      [familyId, threadId, memberId, mutedUntilIso]
    );
  });

export const setThreadKidVisibility = async ({ familyId, threadId, memberId, kidVisible }) =>
  withFamilyContext(familyId, async (client) => {
    await client.query(
      `INSERT INTO thread_member_settings (family_id, thread_id, member_id, kid_visible)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (thread_id, member_id) DO UPDATE SET kid_visible = EXCLUDED.kid_visible`,
      [familyId, threadId, memberId, kidVisible]
    );
  });

/**
 * Members who should receive a push notification when a new message lands.
 * Excludes the author and anyone with active mute or kid_visible=false.
 */
export const findPushRecipients = async ({ familyId, threadId, authorMemberId }) =>
  withFamilyContext(familyId, async (client) => {
    const { rows } = await client.query(
      `SELECT m.id
         FROM family_members m
         LEFT JOIN thread_member_settings s
           ON s.thread_id = $1 AND s.member_id = m.id
        WHERE m.status = 'active'
          AND m.id <> $2
          AND (s.muted_until IS NULL OR s.muted_until < now())
          AND (s.kid_visible IS NULL OR s.kid_visible = true OR m.role_key <> 'child_limited')`,
      [threadId, authorMemberId]
    );
    return rows.map((r) => r.id);
  });
