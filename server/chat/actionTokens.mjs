// Signed action tokens for push-notification approval (Phase 3.9).
//
// When a proposal pushes a "[Agree] [Decline]" notification we mint a
// short-lived HMAC-signed token that:
//   - identifies the proposal id + member id (the only people who can
//     approve are the requiredApprovers from the proposal)
//   - locks the decision payload so a leaked token can't approve a
//     different proposal
//   - expires (default 24h, configurable via PUSH_ACTION_TOKEN_TTL_S)
//
// The SW fetches /api/push/action with { proposalId, actionToken,
// decision }. The handler verifies the token + matches member id, then
// calls decideOnProposal as if the user had clicked through the UI.

import { createHmac, timingSafeEqual } from 'node:crypto';

const DEFAULT_TTL_S = Number(process.env.PUSH_ACTION_TOKEN_TTL_S ?? 86_400);

const requireSecret = () => {
  const secret = process.env.PUSH_ACTION_TOKEN_SECRET ?? process.env.TOKEN_ENC_KEY;
  if (!secret) {
    const err = new Error('PUSH_ACTION_TOKEN_SECRET (or TOKEN_ENC_KEY fallback) must be set.');
    err.status = 500;
    throw err;
  }
  return secret;
};

const sign = (payload) => {
  const secret = requireSecret();
  const json = JSON.stringify(payload);
  const body = Buffer.from(json, 'utf8').toString('base64url');
  const mac = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${mac}`;
};

/**
 * @param {{
 *   proposalId: string,
 *   memberId: string,
 *   familyId: string,
 *   ttlSeconds?: number
 * }} args
 */
export const mintActionToken = ({ proposalId, memberId, familyId, ttlSeconds = DEFAULT_TTL_S }) =>
  sign({
    p: proposalId,
    m: memberId,
    f: familyId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds
  });

/**
 * Verify a signed token. Returns the decoded payload on success or null on
 * any failure. Constant-time MAC comparison.
 */
export const verifyActionToken = (token) => {
  if (typeof token !== 'string') return null;
  const dotIndex = token.lastIndexOf('.');
  if (dotIndex === -1) return null;
  const body = token.slice(0, dotIndex);
  const provided = token.slice(dotIndex + 1);
  let mac;
  try {
    mac = createHmac('sha256', requireSecret()).update(body).digest('base64url');
  } catch {
    return null;
  }
  if (mac.length !== provided.length) return null;
  if (!timingSafeEqual(Buffer.from(mac), Buffer.from(provided))) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof payload?.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
  if (!payload?.p || !payload?.m || !payload?.f) return null;
  return { proposalId: payload.p, memberId: payload.m, familyId: payload.f };
};
