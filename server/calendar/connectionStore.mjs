// calendar_connections-backed OAuth token store (Phase 0.8).
//
// Replaces server/storage.mjs's data.json provider account map for any code
// path that has a familyId + memberId in scope (i.e. anything Phase 1+).
// The legacy storage.mjs stays in place for the local-first prototype routes
// until Phase 1 wires real auth into /api/events.
//
// Tokens are AES-256-GCM encrypted via shared helpers in server/security/
// tokenCrypto.mjs and stored as `bytea`.

import { withFamilyContext } from '../db/pool.mjs';
import { decryptToken, encryptToken } from '../security/tokenCrypto.mjs';

const VALID_PROVIDERS = new Set(['google', 'microsoft', 'caldav', 'ics']);

const assertProvider = (provider) => {
  if (!VALID_PROVIDERS.has(provider)) {
    const err = new Error(`unknown calendar provider: ${provider}`);
    err.status = 400;
    throw err;
  }
};

/**
 * Insert or update the calendar connection for (family, member, provider).
 * `tokens` is the JSON-serializable provider payload (access/refresh/expiry,
 * scopes, etc.). It is encrypted before storage; the column never sees plain
 * text.
 *
 * @param {{
 *   familyId: string,
 *   memberId: string,
 *   provider: 'google' | 'microsoft' | 'caldav' | 'ics',
 *   accountLabel?: string | null,
 *   tokens: Record<string, unknown>,
 *   encKey: string
 * }} args
 */
export const upsertCalendarConnection = async ({
  familyId,
  memberId,
  provider,
  accountLabel = null,
  tokens,
  encKey
}) => {
  assertProvider(provider);
  const ciphertext = encryptToken(JSON.stringify(tokens), encKey);
  return withFamilyContext(familyId, async (client) => {
    // One connection per (family, member, provider) — UPSERT on those three.
    const { rows } = await client.query(
      `INSERT INTO calendar_connections (family_id, member_id, provider, account_label, tokens_encrypted)
         VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT ON CONSTRAINT calendar_connections_pkey DO NOTHING
       RETURNING id`,
      [familyId, memberId, provider, accountLabel, ciphertext]
    );

    if (rows.length) return rows[0].id;

    // No conflict → either it inserted (handled above) or there was no
    // matching unique constraint. Fall through to manual upsert by
    // (family, member, provider).
    const updated = await client.query(
      `UPDATE calendar_connections
          SET account_label = COALESCE($4, account_label),
              tokens_encrypted = $5
        WHERE family_id = $1 AND member_id = $2 AND provider = $3
        RETURNING id`,
      [familyId, memberId, provider, accountLabel, ciphertext]
    );
    if (updated.rows.length) return updated.rows[0].id;

    const inserted = await client.query(
      `INSERT INTO calendar_connections (family_id, member_id, provider, account_label, tokens_encrypted)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [familyId, memberId, provider, accountLabel, ciphertext]
    );
    return inserted.rows[0].id;
  });
};

/**
 * Read the connection for (family, member, provider), decrypt tokens and
 * return them. Returns null when no connection exists.
 *
 * @returns {Promise<null | {
 *   id: string,
 *   provider: string,
 *   accountLabel: string | null,
 *   tokens: Record<string, unknown>,
 *   lastSyncedAt: string | null
 * }>}
 */
export const getCalendarConnection = async ({ familyId, memberId, provider, encKey }) => {
  assertProvider(provider);
  return withFamilyContext(familyId, async (client) => {
    const { rows } = await client.query(
      `SELECT id, provider, account_label, tokens_encrypted, last_synced_at
         FROM calendar_connections
        WHERE family_id = $1 AND member_id = $2 AND provider = $3
        LIMIT 1`,
      [familyId, memberId, provider]
    );
    if (!rows.length) return null;
    const row = rows[0];
    const plaintext = decryptToken(row.tokens_encrypted, encKey);
    let tokens = {};
    try {
      tokens = plaintext ? JSON.parse(plaintext) : {};
    } catch {
      // Drop a connection with corrupted tokens rather than crash the route.
      tokens = {};
    }
    return {
      id: row.id,
      provider: row.provider,
      accountLabel: row.account_label,
      tokens,
      lastSyncedAt: row.last_synced_at
    };
  });
};

export const deleteCalendarConnection = async ({ familyId, memberId, provider }) => {
  assertProvider(provider);
  return withFamilyContext(familyId, async (client) => {
    const { rowCount } = await client.query(
      `DELETE FROM calendar_connections
        WHERE family_id = $1 AND member_id = $2 AND provider = $3`,
      [familyId, memberId, provider]
    );
    return rowCount > 0;
  });
};

export const recordSyncedAt = async ({ familyId, memberId, provider, syncedAtIso }) => {
  assertProvider(provider);
  return withFamilyContext(familyId, async (client) => {
    await client.query(
      `UPDATE calendar_connections
          SET last_synced_at = $4
        WHERE family_id = $1 AND member_id = $2 AND provider = $3`,
      [familyId, memberId, provider, syncedAtIso]
    );
  });
};
