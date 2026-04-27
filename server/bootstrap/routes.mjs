import { randomUUID } from 'node:crypto';
import { buildProviderAuthUrl } from './auth.mjs';
import { readJsonBody, redirect, sendJson } from '../http.mjs';
import {
  assertMaintenanceModeEnabled,
  assertResetRequestAllowed,
  createHttpError,
  validateIcsSubscriptionUrl
} from '../security.mjs';
import { resolveRequestContext, requirePermissionOrFail } from '../auth/middleware.mjs';
import { handleClerkUserCreated, verifyClerkWebhookRequest } from '../auth/clerkWebhook.mjs';
import { importLocalState } from '../migrate/importLocalState.mjs';
import { createInvite, acceptInvite } from '../invites/invites.mjs';
import { handleStripeWebhook } from '../billing/webhook.mjs';
import { savePushSubscription } from '../push/subscriptions.mjs';

export const createRouteHandler = ({
  port,
  clientOrigin,
  encKey,
  maintenanceMode,
  providerConfig,
  storage,
  providerService,
  oauthService,
  icsService
}) => async (req, res) => {
  if (!req.url) throw createHttpError(400, 'Missing request URL.');
  if (req.method === 'OPTIONS') {
    sendJson(res, clientOrigin, 200, { ok: true });
    return;
  }

  const url = new URL(req.url, `http://localhost:${port}`);

  if (url.pathname === '/api/health') {
    sendJson(res, clientOrigin, 200, { ok: true });
    return;
  }

  if (url.pathname === '/api/provider-status') {
    const provider = url.searchParams.get('provider');
    if (provider !== 'google' && provider !== 'microsoft') throw createHttpError(400, 'Unknown calendar provider.');
    const config = providerConfig[provider];
    sendJson(res, clientOrigin, 200, {
      configured: Boolean(config.clientId && config.clientSecret && config.redirectUri && encKey),
      connected: Boolean(storage.getStoredProviderAccount(provider))
    });
    return;
  }

  if (url.pathname === '/api/auth/google/start' || url.pathname === '/api/auth/microsoft/start') {
    const provider = url.pathname.includes('/google/') ? 'google' : 'microsoft';
    providerService.requireProviderConfig(provider);
    const stateId = oauthService.registerReturnTo(provider, url.searchParams.get('returnTo'));
    redirect(res, clientOrigin, buildProviderAuthUrl({ provider, providerConfig, stateId }));
    return;
  }

  if (url.pathname === '/api/auth/google/callback' || url.pathname === '/api/auth/microsoft/callback') {
    const returnTo = await oauthService.completeAuth(url.searchParams.get('state') ?? '', url.searchParams.get('code') ?? '');
    redirect(res, clientOrigin, returnTo);
    return;
  }

  if (url.pathname === '/api/calendars') {
    const provider = url.searchParams.get('provider');
    if (provider !== 'google' && provider !== 'microsoft' && provider !== 'ics') throw createHttpError(400, 'Unknown calendar provider.');
    sendJson(res, clientOrigin, 200, await providerService.listCalendars(provider));
    return;
  }

  if (url.pathname === '/api/events') {
    const provider = url.searchParams.get('provider');
    const calendarId = url.searchParams.get('calendarId') ?? '';
    const timeMin = url.searchParams.get('timeMin') ?? '';
    const timeMax = url.searchParams.get('timeMax') ?? '';
    if (provider !== 'google' && provider !== 'microsoft') throw createHttpError(400, 'Unknown calendar provider.');
    if (!calendarId || !timeMin || !timeMax) throw createHttpError(400, 'calendarId, timeMin, and timeMax are required.');
    sendJson(res, clientOrigin, 200, await providerService.listEvents(provider, calendarId, timeMin, timeMax));
    return;
  }

  if (url.pathname === '/api/ics/subscribe' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const name = String(body?.name ?? '').trim();
    const subscriptionUrl = await validateIcsSubscriptionUrl(String(body?.url ?? '').trim());
    if (!name || !subscriptionUrl) throw createHttpError(400, 'name and url are required.');
    const existing = storage.persistedState.icsSubscriptions.find((item) => item.url === subscriptionUrl);
    if (existing) {
      sendJson(res, clientOrigin, 200, { id: existing.id, name: existing.name });
      return;
    }
    const subscription = { id: randomUUID(), name, url: subscriptionUrl, createdAtIso: new Date().toISOString() };
    storage.addIcsSubscription(subscription);
    sendJson(res, clientOrigin, 200, { id: subscription.id, name: subscription.name });
    return;
  }

  if (url.pathname.startsWith('/api/ics/subscriptions/') && req.method === 'DELETE') {
    const subscriptionId = decodeURIComponent(url.pathname.split('/').pop() ?? '');
    const removed = storage.removeIcsSubscription(subscriptionId);
    icsService.clearSubscription(subscriptionId);
    if (!removed) throw createHttpError(404, 'ICS subscription not found.');
    sendJson(res, clientOrigin, 200, { ok: true });
    return;
  }

  if (url.pathname === '/api/ics/events') {
    const subscriptionId = url.searchParams.get('subscriptionId') ?? '';
    const subscription = storage.persistedState.icsSubscriptions.find((item) => item.id === subscriptionId);
    if (!subscription) throw createHttpError(404, 'ICS subscription not found.');
    sendJson(res, clientOrigin, 200, await icsService.fetchIcsEvents(subscription));
    return;
  }

  if (url.pathname === '/api/reset' && req.method === 'POST') {
    assertMaintenanceModeEnabled(maintenanceMode, '/api/reset');
    // The origin check must happen after maintenance-mode gating so the route remains
    // inert in normal runtime and only validates callers during explicit maintenance runs.
    assertResetRequestAllowed(req, clientOrigin);
    storage.reset();
    icsService.clearAll();
    sendJson(res, clientOrigin, 200, { ok: true, maintenanceMode: true });
    return;
  }

  // ----- Phase 0 SaaS routes (auth-gated, DB-backed) ---------------------
  // Each route below resolves the active request context (Clerk session →
  // family_member row) and checks a typed permission. These coexist with the
  // local-first prototype routes above; the prototype keeps working for dev
  // until Phase 1+ replaces it.

  if (url.pathname === '/api/webhooks/clerk' && req.method === 'POST') {
    const event = await verifyClerkWebhookRequest(req);
    if (event?.type === 'user.created') await handleClerkUserCreated(event.data);
    sendJson(res, clientOrigin, 200, { ok: true });
    return;
  }

  if (url.pathname === '/api/webhooks/stripe' && req.method === 'POST') {
    await handleStripeWebhook(req);
    sendJson(res, clientOrigin, 200, { ok: true });
    return;
  }

  if (url.pathname === '/api/migrate/local-state' && req.method === 'POST') {
    const ctx = await resolveRequestContext(req);
    requirePermissionOrFail(ctx, 'data_export');
    const body = await readJsonBody(req);
    const counts = await importLocalState({
      familyId: ctx.member.familyId,
      actorMemberId: ctx.member.id,
      localState: body?.state ?? body
    });
    sendJson(res, clientOrigin, 200, { ok: true, counts });
    return;
  }

  if (url.pathname === '/api/invites' && req.method === 'POST') {
    const ctx = await resolveRequestContext(req);
    requirePermissionOrFail(ctx, 'pin_manage');
    const body = await readJsonBody(req);
    const invite = await createInvite({
      familyId: ctx.member.familyId,
      invitedByMemberId: ctx.member.id,
      email: String(body?.email ?? '').trim(),
      roleKey: body?.roleKey
    });
    sendJson(res, clientOrigin, 201, { invite });
    return;
  }

  if (url.pathname === '/api/invites/accept' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const ctx = await resolveRequestContext(req);
    if (!ctx) {
      sendJson(res, clientOrigin, 401, { error: 'unauthorized' });
      return;
    }
    const member = await acceptInvite({
      token: String(body?.token ?? ''),
      userId: ctx.userId,
      displayName: String(body?.displayName ?? '').trim()
    });
    sendJson(res, clientOrigin, 200, { member });
    return;
  }

  if (url.pathname === '/api/push/subscribe' && req.method === 'POST') {
    const ctx = await resolveRequestContext(req);
    if (!ctx) {
      sendJson(res, clientOrigin, 401, { error: 'unauthorized' });
      return;
    }
    const body = await readJsonBody(req);
    await savePushSubscription({
      familyId: ctx.member.familyId,
      memberId: ctx.member.id,
      subscription: body
    });
    sendJson(res, clientOrigin, 201, { ok: true });
    return;
  }

  sendJson(res, clientOrigin, 404, { error: 'Not found' });
};
