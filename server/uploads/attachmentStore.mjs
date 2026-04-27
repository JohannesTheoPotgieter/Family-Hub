// Attachments DB layer (Phase 3.4).
//
// Insert + list helpers for the `attachments` table created in 0006.
// Tenant-scoped through withFamilyContext.

import { withFamilyContext } from '../db/pool.mjs';

const KIND_BY_MIME = (mime) => {
  if (!mime) return 'other';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'doc';
  if (mime.startsWith('text/')) return 'doc';
  return 'other';
};

const rowToAttachment = (row) => ({
  id: row.id,
  uploaderId: row.uploader_id,
  storageKey: row.storage_key,
  mimeType: row.mime_type,
  byteSize: Number(row.byte_size),
  kind: row.kind,
  width: row.width ?? null,
  height: row.height ?? null,
  caption: row.caption ?? null,
  messageId: row.message_id ?? null,
  eventId: row.event_id ?? null,
  transactionId: row.transaction_id ?? null,
  billId: row.bill_id ?? null,
  moderationState: row.moderation_state,
  moderationReasons: row.moderation_reasons,
  createdAt: row.created_at
});

/**
 * @param {{
 *   familyId: string,
 *   uploaderId: string,
 *   storageKey: string,
 *   mimeType: string,
 *   byteSize: number,
 *   width?: number | null,
 *   height?: number | null,
 *   caption?: string | null,
 *   messageId?: string | null,
 *   eventId?: string | null,
 *   transactionId?: string | null,
 *   billId?: string | null
 * }} args
 */
export const finalizeAttachment = async ({
  familyId,
  uploaderId,
  storageKey,
  mimeType,
  byteSize,
  width = null,
  height = null,
  caption = null,
  messageId = null,
  eventId = null,
  transactionId = null,
  billId = null
}) =>
  withFamilyContext(familyId, async (client) => {
    const { rows } = await client.query(
      `INSERT INTO attachments (
          family_id, uploader_id, storage_key, mime_type, byte_size, kind,
          width, height, caption, message_id, event_id, transaction_id, bill_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        familyId,
        uploaderId,
        storageKey,
        mimeType,
        byteSize,
        KIND_BY_MIME(mimeType),
        width,
        height,
        caption,
        messageId,
        eventId,
        transactionId,
        billId
      ]
    );
    return rowToAttachment(rows[0]);
  });

/**
 * Photo timeline (Phase 3.11 backend). Family-wide newest-first list,
 * optionally filtered to a specific kind.
 */
export const listAttachments = async ({ familyId, kind, limit = 50, beforeIso }) =>
  withFamilyContext(familyId, async (client) => {
    const conds = [`moderation_state <> 'hidden'`];
    const values = [];
    if (kind) {
      values.push(kind);
      conds.push(`kind = $${values.length}`);
    }
    if (beforeIso) {
      values.push(beforeIso);
      conds.push(`created_at < $${values.length}`);
    }
    values.push(limit);
    const { rows } = await client.query(
      `SELECT * FROM attachments
        WHERE ${conds.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT $${values.length}`,
      values
    );
    return rows.map(rowToAttachment);
  });
