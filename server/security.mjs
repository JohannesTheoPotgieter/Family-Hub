import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export const createHttpError = (status, message) => Object.assign(new Error(message), { status });

export const isPrivateIpAddress = (address) => {
  if (!address) return true;
  if (address === '::1' || address === '0:0:0:0:0:0:0:1') return true;
  if (address.startsWith('fe80:') || address.startsWith('fc') || address.startsWith('fd')) return true;
  if (!isIP(address)) return false;
  if (address.startsWith('10.') || address.startsWith('127.') || address.startsWith('192.168.')) return true;
  if (address.startsWith('169.254.')) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(address)) return true;
  return false;
};

export const sanitizeReturnTo = (provider, requestedReturnTo, clientOrigin, defaultReturnTo) => {
  const fallback = defaultReturnTo[provider];
  try {
    const allowedOrigin = new URL(clientOrigin).origin;
    const candidate = new URL(requestedReturnTo || fallback, clientOrigin);
    return candidate.origin === allowedOrigin ? candidate.toString() : fallback;
  } catch {
    return fallback;
  }
};

export const validateIcsSubscriptionUrl = async (rawUrl) => {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw createHttpError(400, 'Add a valid ICS URL that starts with https:// or http://.');
  }

  if (!['https:', 'http:'].includes(parsed.protocol)) throw createHttpError(400, 'ICS subscriptions must use http:// or https:// links.');
  if (parsed.username || parsed.password) throw createHttpError(400, 'ICS URLs with embedded credentials are not allowed.');
  if (parsed.hostname === 'localhost' || parsed.hostname.endsWith('.local')) throw createHttpError(400, 'Local network ICS URLs are not allowed.');
  if (isPrivateIpAddress(parsed.hostname)) throw createHttpError(400, 'Private network ICS URLs are not allowed.');

  try {
    const resolved = await lookup(parsed.hostname, { all: true });
    if (resolved.some((entry) => isPrivateIpAddress(entry.address))) throw createHttpError(400, 'Private network ICS URLs are not allowed.');
  } catch (error) {
    if (error?.status) throw error;
    throw createHttpError(400, 'That ICS URL could not be verified.');
  }

  return parsed.toString();
};

export const assertResetRequestAllowed = (req, clientOrigin) => {
  const origin = req.headers.origin || '';
  const referer = req.headers.referer || '';
  const allowedOrigin = new URL(clientOrigin).origin;
  const originOk = origin ? origin === allowedOrigin : true;
  const refererOk = referer ? referer.startsWith(`${allowedOrigin}/`) || referer === allowedOrigin : true;
  if (!originOk || !refererOk) throw createHttpError(403, 'Reset requests must come from the Family Hub app origin.');
};
