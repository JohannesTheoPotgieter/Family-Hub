// Single-use realtime tickets (Phase 3.3 auth).
//
// EventSource doesn't carry custom headers, so the SSE GET route uses a
// signed ticket in the query string instead of a Bearer token. Tickets
// are minted via POST /api/v2/realtime/ticket (session-authenticated) and
// validated on GET /api/v2/realtime?ticket=...
//
// Single-use is enforced by adding the ticket id to a short-lived Redis
// key (or in-memory Set in single-instance dev). 5-minute TTL is plenty
// for the client to open the stream right after minting.
//
// HMAC payload: { jti, f (familyId), m (memberId), exp }.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import IORedis from 'ioredis';

const TTL_SECONDS = 5 * 60;

let redis = null;
const usedLocal = new Set();

const initRedis = () => {
  if (redis || !process.env.REDIS_URL) return;
  redis = new IORedis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  });
};
initRedis();

const requireSecret = () => {
  const secret = process.env.REALTIME_TICKET_SECRET ?? process.env.TOKEN_ENC_KEY;
  if (!secret) {
    const err = new Error('REALTIME_TICKET_SECRET (or TOKEN_ENC_KEY fallback) must be set.');
    err.status = 500;
    throw err;
  }
  return secret;
};

const sign = (payload) => {
  const secret = requireSecret();
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const mac = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${mac}`;
};

export const mintTicket = ({ familyId, memberId }) => {
  const jti = randomBytes(12).toString('base64url');
  return sign({
    jti,
    f: familyId,
    m: memberId,
    exp: Math.floor(Date.now() / 1000) + TTL_SECONDS
  });
};

export const verifyTicket = async (token) => {
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
  if (!payload?.jti || !payload?.f || !payload?.m) return null;

  // Single-use enforcement.
  if (redis) {
    const reserved = await redis.set(`realtime:ticket:${payload.jti}`, '1', 'EX', TTL_SECONDS, 'NX');
    if (reserved !== 'OK') return null;
  } else {
    if (usedLocal.has(payload.jti)) return null;
    usedLocal.add(payload.jti);
    setTimeout(() => usedLocal.delete(payload.jti), TTL_SECONDS * 1000).unref?.();
  }

  return { familyId: payload.f, memberId: payload.m, jti: payload.jti };
};
