// Clerk session verification (Phase 0.4).
//
// All session verification flows through `verifyRequestSession(req)` which
// returns either a sanitized `{ userId, primaryEmail }` payload or null.
// Routes that mutate data should call `requireAuth` (see middleware.mjs).
//
// Clerk SDK calls are isolated here so tests can swap the verifier with a
// fake. In CI the env vars aren't set; `isClerkConfigured()` returns false
// and `verifyRequestSession` returns null without crashing.

import { createClerkClient, verifyToken } from '@clerk/backend';

let cachedClient = null;

export const isClerkConfigured = () => Boolean(process.env.CLERK_SECRET_KEY);

const getClient = () => {
  if (cachedClient) return cachedClient;
  if (!isClerkConfigured()) return null;
  cachedClient = createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY,
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY
  });
  return cachedClient;
};

const extractToken = (req) => {
  const header = req?.headers?.authorization ?? req?.headers?.Authorization;
  if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }
  // Fallback: __session cookie set by Clerk's frontend SDK.
  const cookieHeader = req?.headers?.cookie;
  if (typeof cookieHeader === 'string') {
    const match = cookieHeader.match(/(?:^|;\s*)__session=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
};

/**
 * @returns {Promise<{ userId: string, primaryEmail: string | null } | null>}
 */
export const verifyRequestSession = async (req) => {
  if (!isClerkConfigured()) return null;
  const token = extractToken(req);
  if (!token) return null;
  try {
    const claims = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
      authorizedParties: process.env.CLERK_AUTHORIZED_PARTIES?.split(',').map((s) => s.trim()) ?? []
    });
    if (!claims?.sub) return null;
    // Pull the user's primary email lazily — only needed by signup paths.
    return {
      userId: claims.sub,
      primaryEmail: claims.email ?? null
    };
  } catch {
    return null;
  }
};

/**
 * Verify a Clerk webhook signature. Used by the user.created handler in
 * routes.mjs to seed a family on first sign-up. Returns the parsed event
 * body or throws if the signature is invalid.
 */
export const verifyClerkWebhook = async (rawBody, headers) => {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) throw new Error('CLERK_WEBHOOK_SECRET is not set.');
  const { Webhook } = await import('svix');
  const wh = new Webhook(secret);
  return wh.verify(rawBody, {
    'svix-id': headers['svix-id'],
    'svix-timestamp': headers['svix-timestamp'],
    'svix-signature': headers['svix-signature']
  });
};

export const fetchClerkUser = async (userId) => {
  const client = getClient();
  if (!client) return null;
  return client.users.getUser(userId);
};
