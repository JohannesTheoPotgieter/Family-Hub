import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createIcsService } from './ics.mjs';
import { readJsonBody, redirect, sendError, sendJson } from './http.mjs';
import { createOauthService } from './oauth.mjs';
import { createProviderService } from './providers.mjs';
import {
  assertMaintenanceModeEnabled,
  assertResetRequestAllowed,
  createHttpError,
  isPrivateIpAddress,
  sanitizeReturnTo as sanitizeReturnToBase,
  validateIcsSubscriptionUrl
} from './security.mjs';
import { createServerStorage } from './storage.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8787);
const clientOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5000';
const rawEncKey = (process.env.TOKEN_ENC_KEY ?? '').trim();
const encKey = Buffer.byteLength(rawEncKey) >= 32 ? Buffer.from(rawEncKey).subarray(0, 32) : null;
const dataFile = resolve(__dirname, '.family-hub-server.json');
const maintenanceMode = process.env.FAMILY_HUB_MAINTENANCE_MODE === '1';

const providerConfig = {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI ?? `http://localhost:${port}/api/auth/google/callback`,
    scope: 'https://www.googleapis.com/auth/calendar.readonly'
  },
  microsoft: {
    clientId: process.env.MICROSOFT_CLIENT_ID ?? '',
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET ?? '',
    redirectUri: process.env.MICROSOFT_REDIRECT_URI ?? `http://localhost:${port}/api/auth/microsoft/callback`,
    scope: 'offline_access User.Read Calendars.Read'
  }
};
const providerLabel = { google: 'Google', microsoft: 'Outlook' };
const defaultReturnTo = {
  google: `${clientOrigin}/?tab=Calendar&provider=google&connected=1`,
  microsoft: `${clientOrigin}/?tab=Calendar&provider=microsoft&connected=1`
};

const storage = createServerStorage({ dataFile, encKey });
const providerService = createProviderService({ providerConfig, providerLabel, storage });
const icsService = createIcsService();
const sanitizeReturnTo = (provider, requestedReturnTo) => sanitizeReturnToBase(provider, requestedReturnTo, clientOrigin, defaultReturnTo);
const oauthService = createOauthService({ clientOrigin, providerConfig, defaultReturnTo, providerService, redirect, sanitizeReturnTo: sanitizeReturnToBase });

export { isPrivateIpAddress, validateIcsSubscriptionUrl };
export const sanitizeReturnToPublic = sanitizeReturnTo;
export { sanitizeReturnToPublic as sanitizeReturnTo };

// Normal server boot must stay read-only with respect to durable state. Startup only loads
// the existing persistence file so production/staging restarts remain predictable.
export const server = createServer(async (req, res) => {
  try {
    if (!req.url) throw createHttpError(400, 'Missing request URL.');
    if (req.method === 'OPTIONS') {
      sendJson(res, clientOrigin, 200, { ok: true });
      return;
    }
    const url = new URL(req.url, `http://localhost:${port}`);

    if (url.pathname === '/api/health') return sendJson(res, clientOrigin, 200, { ok: true });

    if (url.pathname === '/api/provider-status') {
      const provider = url.searchParams.get('provider');
      if (provider !== 'google' && provider !== 'microsoft') throw createHttpError(400, 'Unknown calendar provider.');
      const config = providerConfig[provider];
      return sendJson(res, clientOrigin, 200, { configured: Boolean(config.clientId && config.clientSecret && config.redirectUri && encKey), connected: Boolean(storage.getStoredProviderAccount(provider)) });
    }

    if (url.pathname === '/api/auth/google/start') {
      providerService.requireProviderConfig('google');
      const stateId = oauthService.registerReturnTo('google', url.searchParams.get('returnTo'));
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      const config = providerConfig.google;
      authUrl.searchParams.set('client_id', config.clientId);
      authUrl.searchParams.set('redirect_uri', config.redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', config.scope);
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');
      authUrl.searchParams.set('state', stateId);
      return redirect(res, clientOrigin, authUrl.toString());
    }

    if (url.pathname === '/api/auth/microsoft/start') {
      providerService.requireProviderConfig('microsoft');
      const stateId = oauthService.registerReturnTo('microsoft', url.searchParams.get('returnTo'));
      const authUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
      const config = providerConfig.microsoft;
      authUrl.searchParams.set('client_id', config.clientId);
      authUrl.searchParams.set('redirect_uri', config.redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('response_mode', 'query');
      authUrl.searchParams.set('scope', config.scope);
      authUrl.searchParams.set('state', stateId);
      return redirect(res, clientOrigin, authUrl.toString());
    }

    if (url.pathname === '/api/auth/google/callback' || url.pathname === '/api/auth/microsoft/callback') {
      const returnTo = await oauthService.completeAuth(url.searchParams.get('state') ?? '', url.searchParams.get('code') ?? '');
      return redirect(res, clientOrigin, returnTo);
    }

    if (url.pathname === '/api/calendars') {
      const provider = url.searchParams.get('provider');
      if (provider !== 'google' && provider !== 'microsoft' && provider !== 'ics') throw createHttpError(400, 'Unknown calendar provider.');
      return sendJson(res, clientOrigin, 200, await providerService.listCalendars(provider));
    }

    if (url.pathname === '/api/events') {
      const provider = url.searchParams.get('provider');
      const calendarId = url.searchParams.get('calendarId') ?? '';
      const timeMin = url.searchParams.get('timeMin') ?? '';
      const timeMax = url.searchParams.get('timeMax') ?? '';
      if (provider !== 'google' && provider !== 'microsoft') throw createHttpError(400, 'Unknown calendar provider.');
      if (!calendarId || !timeMin || !timeMax) throw createHttpError(400, 'calendarId, timeMin, and timeMax are required.');
      return sendJson(res, clientOrigin, 200, await providerService.listEvents(provider, calendarId, timeMin, timeMax));
    }

    if (url.pathname === '/api/ics/subscribe' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const name = String(body?.name ?? '').trim();
      const subscriptionUrl = await validateIcsSubscriptionUrl(String(body?.url ?? '').trim());
      if (!name || !subscriptionUrl) throw createHttpError(400, 'name and url are required.');
      const existing = storage.persistedState.icsSubscriptions.find((item) => item.url === subscriptionUrl);
      if (existing) return sendJson(res, clientOrigin, 200, { id: existing.id, name: existing.name });
      const subscription = { id: randomUUID(), name, url: subscriptionUrl, createdAtIso: new Date().toISOString() };
      storage.addIcsSubscription(subscription);
      return sendJson(res, clientOrigin, 200, { id: subscription.id, name: subscription.name });
    }

    if (url.pathname.startsWith('/api/ics/subscriptions/') && req.method === 'DELETE') {
      const subscriptionId = decodeURIComponent(url.pathname.split('/').pop() ?? '');
      const removed = storage.removeIcsSubscription(subscriptionId);
      icsService.clearSubscription(subscriptionId);
      if (!removed) throw createHttpError(404, 'ICS subscription not found.');
      return sendJson(res, clientOrigin, 200, { ok: true });
    }

    if (url.pathname === '/api/ics/events') {
      const subscriptionId = url.searchParams.get('subscriptionId') ?? '';
      const subscription = storage.persistedState.icsSubscriptions.find((item) => item.id === subscriptionId);
      if (!subscription) throw createHttpError(404, 'ICS subscription not found.');
      return sendJson(res, clientOrigin, 200, await icsService.fetchIcsEvents(subscription));
    }

    if (url.pathname === '/api/reset' && req.method === 'POST') {
      assertMaintenanceModeEnabled(maintenanceMode, '/api/reset');
      assertResetRequestAllowed(req, clientOrigin);
      storage.reset();
      icsService.clearAll();
      return sendJson(res, clientOrigin, 200, { ok: true, maintenanceMode: true });
    }

    return sendJson(res, clientOrigin, 404, { error: 'Not found' });
  } catch (error) {
    return sendError(res, clientOrigin, error);
  }
});

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(port, () => {
    console.log(`Family Hub server listening on ${port}`);
  });
}
