// Family invites (Phase 0.7).
//
// createInvite: parent_admin / adult_editor calls POST /api/invites with an
// email + role; we mint a signed token (raw) and store its hash, send an
// email via Resend, return the invite shape (raw token only included so the
// inviter can copy/share if email fails).
//
// acceptInvite: the recipient lands on the app, signs into Clerk, then
// POSTs the raw token to /api/invites/accept. We hash, look up, mark
// accepted, and create the family_member row tied to the new userId.
//
// Tokens are 32 random bytes, base64url. We store SHA-256 hashes only so a
// DB compromise can't be turned into account takeovers.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { getPool } from '../db/pool.mjs';
import { inviteEmailTemplate, isEmailConfigured, sendEmail } from '../email/resend.mjs';

const VALID_ROLES = new Set(['adult_editor', 'child_limited']);
const INVITE_TTL_DAYS = 14;

const hashToken = (raw) => createHash('sha256').update(raw, 'utf8').digest('hex');

const buildAcceptUrl = (token) => {
  const base = process.env.PUBLIC_APP_URL ?? 'http://localhost:5173';
  return `${base.replace(/\/$/, '')}/invite?token=${encodeURIComponent(token)}`;
};

const isEmail = (value) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);

/**
 * @param {{
 *   familyId: string,
 *   invitedByMemberId: string,
 *   email: string,
 *   roleKey: 'adult_editor' | 'child_limited'
 * }} args
 */
export const createInvite = async ({ familyId, invitedByMemberId, email, roleKey }) => {
  if (!isEmail(email)) {
    const err = new Error('invalid email address');
    err.status = 400;
    throw err;
  }
  if (!VALID_ROLES.has(roleKey)) {
    const err = new Error('roleKey must be adult_editor or child_limited');
    err.status = 400;
    throw err;
  }

  const rawToken = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const pool = getPool();
  const client = await pool.connect();
  let inviteRow;
  let inviterName = 'Someone';
  let familyName = 'your family';
  try {
    await client.query('BEGIN');

    // Look up inviter + family for email rendering inside the same tx so a
    // concurrent rename doesn't drift the email vs the invite row.
    const ctx = await client.query(
      `SELECT m.display_name AS inviter_name, f.name AS family_name
         FROM family_members m JOIN families f ON f.id = m.family_id
        WHERE m.id = $1 AND m.family_id = $2 LIMIT 1`,
      [invitedByMemberId, familyId]
    );
    if (!ctx.rows.length) {
      const err = new Error('inviter not found in family');
      err.status = 404;
      throw err;
    }
    inviterName = ctx.rows[0].inviter_name;
    familyName = ctx.rows[0].family_name;

    const inserted = await client.query(
      `INSERT INTO invites (family_id, email, role_key, token_hash, invited_by_member_id, expires_at)
       VALUES ($1, lower($2), $3, $4, $5, $6)
       RETURNING id, family_id, email, role_key, status, expires_at, created_at`,
      [familyId, email, roleKey, tokenHash, invitedByMemberId, expiresAt]
    );
    inviteRow = inserted.rows[0];

    await client.query(
      `INSERT INTO audit_log (family_id, actor_member_id, action, entity_kind, entity_id, diff)
       VALUES ($1, $2, 'invite.created', 'invite', $3, $4::jsonb)`,
      [familyId, invitedByMemberId, inviteRow.id, JSON.stringify({ email, roleKey })]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  const acceptUrl = buildAcceptUrl(rawToken);
  let emailResult = { ok: false, reason: 'not_configured' };
  if (isEmailConfigured()) {
    const tpl = inviteEmailTemplate({ inviterName, familyName, acceptUrl });
    emailResult = await sendEmail({ to: email, ...tpl });
  }

  return {
    id: inviteRow.id,
    familyId: inviteRow.family_id,
    email: inviteRow.email,
    roleKey: inviteRow.role_key,
    status: inviteRow.status,
    expiresAt: inviteRow.expires_at,
    // The raw token is returned ONCE to the inviter so they can fall back to
    // copy/share if email send fails. It is NEVER stored.
    acceptUrl,
    emailSent: emailResult.ok
  };
};

/**
 * @param {{ token: string, userId: string, displayName: string }} args
 */
export const acceptInvite = async ({ token, userId, displayName }) => {
  if (!token || typeof token !== 'string') {
    const err = new Error('token is required');
    err.status = 400;
    throw err;
  }
  if (!displayName) {
    const err = new Error('displayName is required');
    err.status = 400;
    throw err;
  }

  const tokenHash = hashToken(token);
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, family_id, email, role_key, status, expires_at, token_hash
         FROM invites WHERE token_hash = $1 LIMIT 1
         FOR UPDATE`,
      [tokenHash]
    );
    if (!rows.length) {
      const err = new Error('invite not found');
      err.status = 404;
      throw err;
    }
    const invite = rows[0];

    // Constant-time comparison even though we already filtered by hash —
    // belt-and-braces against future code that loosens the lookup.
    const expected = Buffer.from(invite.token_hash, 'hex');
    const actual = Buffer.from(tokenHash, 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      const err = new Error('invite token mismatch');
      err.status = 401;
      throw err;
    }

    if (invite.status !== 'pending') {
      const err = new Error(`invite is ${invite.status}`);
      err.status = 410;
      throw err;
    }
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      await client.query(`UPDATE invites SET status = 'expired' WHERE id = $1`, [invite.id]);
      await client.query('COMMIT');
      const err = new Error('invite expired');
      err.status = 410;
      throw err;
    }

    // Either link to an existing pending member with this user_id (rare) or
    // create a fresh active member.
    const { rows: existing } = await client.query(
      `SELECT id FROM family_members WHERE family_id = $1 AND user_id = $2 LIMIT 1`,
      [invite.family_id, userId]
    );
    let memberId;
    if (existing.length) {
      memberId = existing[0].id;
      await client.query(
        `UPDATE family_members SET status = 'active', display_name = $2, role_key = $3 WHERE id = $1`,
        [memberId, displayName, invite.role_key]
      );
    } else {
      const inserted = await client.query(
        `INSERT INTO family_members (family_id, user_id, display_name, role_key, status)
         VALUES ($1, $2, $3, $4, 'active') RETURNING id`,
        [invite.family_id, userId, displayName, invite.role_key]
      );
      memberId = inserted.rows[0].id;
    }

    await client.query(
      `UPDATE invites SET status = 'accepted', accepted_at = now() WHERE id = $1`,
      [invite.id]
    );
    await client.query(
      `INSERT INTO audit_log (family_id, actor_member_id, action, entity_kind, entity_id, diff)
       VALUES ($1, $2, 'invite.accepted', 'invite', $3, $4::jsonb)`,
      [invite.family_id, memberId, invite.id, JSON.stringify({ userId })]
    );

    await client.query('COMMIT');

    return {
      id: memberId,
      familyId: invite.family_id,
      roleKey: invite.role_key,
      displayName
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};
