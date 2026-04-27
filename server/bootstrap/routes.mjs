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
import { buildMePayload } from '../auth/me.mjs';
import { handleClerkUserCreated, verifyClerkWebhookRequest } from '../auth/clerkWebhook.mjs';
import { importLocalState } from '../migrate/importLocalState.mjs';
import { createInvite, acceptInvite } from '../invites/invites.mjs';
import { handleStripeWebhook } from '../billing/webhook.mjs';
import { savePushSubscription } from '../push/subscriptions.mjs';
import {
  createEvent,
  deleteEvent,
  listFamilyEvents,
  updateEvent
} from '../calendar/eventStore.mjs';
import { mirrorEventUpsert } from '../calendar/mirrorOutbound.mjs';
import { expandRecurrence } from '../../src/domain/recurrence.ts';
import { findConflicts } from '../../src/domain/calendar.ts';
import {
  createTask,
  createTaskList,
  deleteTask,
  deleteTaskList,
  listTasks,
  listTaskLists,
  updateTask
} from '../tasks/taskStore.mjs';
import { completeTask, getMemberPoints } from '../tasks/completion.mjs';
import { decideOnProposal, proposeChange } from '../chat/proposalEngine.mjs';
import { ROLE_PERMISSIONS } from '../auth/permissions.mjs';
import { loadFamilyMembers } from '../auth/familyMembers.mjs';
import {
  addReaction,
  hideMessage,
  insertMessage,
  listMessages,
  markThreadRead,
  removeReaction,
  setThreadKidVisibility,
  setThreadMute
} from '../chat/messageStore.mjs';
import { ensureDirectThread, getThread, listVisibleThreads } from '../chat/threadStore.mjs';
import { fanOutMessagePush } from '../chat/messagePush.mjs';
import { moderateText } from '../chat/moderation.mjs';
import { buildAttachmentReadUrl, createUploadUrl } from '../uploads/r2.mjs';
import { finalizeAttachment, listAttachments } from '../uploads/attachmentStore.mjs';
import { parseProposalIntent } from '../chat/aiParse.mjs';
import { reserveAiParse } from '../chat/aiParseQuota.mjs';
import { verifyActionToken } from '../chat/actionTokens.mjs';
import { broadcast, openSseStream } from '../realtime/sse.mjs';
import { mintTicket, verifyTicket } from '../realtime/ticket.mjs';
import { findConnectionByChannelId } from '../calendar/syncState.mjs';
import { enqueueGooglePush } from '../calendar/syncWorker.mjs';

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

  // ----- Public config + session payload --------------------------------

  if (url.pathname === '/api/public-config' && req.method === 'GET') {
    // Unauthenticated; the UI uses this on first load to learn the Clerk
    // publishable key + VAPID public key without exposing secrets.
    sendJson(res, clientOrigin, 200, {
      clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY ?? null,
      vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? null,
      stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? null,
      publicAppUrl: process.env.PUBLIC_APP_URL ?? null
    });
    return;
  }

  if (url.pathname === '/api/me' && req.method === 'GET') {
    const ctx = await resolveRequestContext(req);
    if (!ctx) {
      sendJson(res, clientOrigin, 401, { error: 'unauthorized' });
      return;
    }
    sendJson(res, clientOrigin, 200, await buildMePayload(ctx));
    return;
  }

  // ----- Phase 0 SaaS routes (auth-gated, DB-backed) ---------------------
  // Each route below resolves the active request context (Clerk session →
  // family_member row) and checks a typed permission. These coexist with the
  // local-first prototype routes above; the prototype keeps working for dev
  // until Phase 1+ replaces it.

  if (url.pathname === '/api/calendar/webhooks/google' && req.method === 'POST') {
    // Google push notifications carry no body — all signal lives in the
    // X-Goog-* headers. Validate the channel id matches a known connection,
    // verify the token if we set one, then enqueue a delta-fetch job and
    // 200 immediately. Google retries on non-200, so processing must stay
    // out of band.
    const channelId = req.headers['x-goog-channel-id'];
    const channelToken = req.headers['x-goog-channel-token'];
    const resourceState = req.headers['x-goog-resource-state'];

    if (!channelId || typeof channelId !== 'string') {
      sendJson(res, clientOrigin, 400, { error: 'missing_channel_id' });
      return;
    }
    // Sync messages on channel creation come through with state='sync' — ack.
    if (resourceState === 'sync') {
      sendJson(res, clientOrigin, 200, { ok: true, ack: 'sync' });
      return;
    }

    const connection = await findConnectionByChannelId(channelId);
    if (!connection) {
      sendJson(res, clientOrigin, 404, { error: 'unknown_channel' });
      return;
    }

    const expectedToken = process.env.GOOGLE_WATCH_TOKEN ?? channelId;
    if (channelToken !== expectedToken) {
      sendJson(res, clientOrigin, 403, { error: 'token_mismatch' });
      return;
    }

    await enqueueGooglePush({
      familyId: connection.familyId,
      memberId: connection.memberId,
      channelId,
      resourceId: req.headers['x-goog-resource-id'] ?? null
    });
    sendJson(res, clientOrigin, 200, { ok: true });
    return;
  }

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

  if (url.pathname === '/api/v2/conflicts' && req.method === 'GET') {
    const ctx = await resolveRequestContext(req);
    if (!ctx) {
      sendJson(res, clientOrigin, 401, { error: 'unauthorized' });
      return;
    }
    const fromIso = url.searchParams.get('from');
    const toIso = url.searchParams.get('to');
    if (!fromIso || !toIso) throw createHttpError(400, 'from and to query params required.');

    const events = await listFamilyEvents({ familyId: ctx.member.familyId, fromIso, toIso });
    // Expand recurrence into concrete occurrences so the conflict finder
    // catches Wed-soccer-vs-Wed-meeting clashes, not just first-instance
    // overlaps.
    const expanded = expandRecurrence(events, fromIso, toIso);
    const conflicts = findConflicts(expanded);
    sendJson(res, clientOrigin, 200, { conflicts });
    return;
  }

  if (url.pathname === '/api/v2/events' && req.method === 'GET') {
    const ctx = await resolveRequestContext(req);
    if (!ctx) {
      sendJson(res, clientOrigin, 401, { error: 'unauthorized' });
      return;
    }
    const fromIso = url.searchParams.get('from');
    const toIso = url.searchParams.get('to');
    if (!fromIso || !toIso) throw createHttpError(400, 'from and to query params required.');
    const events = await listFamilyEvents({ familyId: ctx.member.familyId, fromIso, toIso });
    sendJson(res, clientOrigin, 200, { events });
    return;
  }

  if (url.pathname === '/api/v2/events' && req.method === 'POST') {
    const ctx = await resolveRequestContext(req);
    requirePermissionOrFail(ctx, 'calendar_edit');
    const body = await readJsonBody(req);
    const event = await createEvent({
      familyId: ctx.member.familyId,
      actorMemberId: ctx.member.id,
      event: {
        title: String(body?.title ?? '').trim() || 'Untitled',
        description: body?.description ?? null,
        location: body?.location ?? null,
        startsAt: String(body?.startsAt ?? ''),
        endsAt: String(body?.endsAt ?? ''),
        allDay: Boolean(body?.allDay),
        rruleText: body?.rruleText ?? null,
        calendarConnectionId: body?.calendarConnectionId ?? null,
        attendeeMemberIds: Array.isArray(body?.attendeeMemberIds) ? body.attendeeMemberIds : []
      }
    });
    // Best-effort outbound mirror; logs but never fails the request — the
    // sync worker reconciles on the next poll.
    if (event.calendarId && event.calendarId !== 'internal') {
      await mirrorEventUpsert({
        familyId: ctx.member.familyId,
        actorMemberId: ctx.member.id,
        memberId: ctx.member.id,
        event
      }).catch(() => {});
    }
    sendJson(res, clientOrigin, 201, { event });
    return;
  }

  if (url.pathname.startsWith('/api/v2/events/') && req.method === 'PATCH') {
    const ctx = await resolveRequestContext(req);
    requirePermissionOrFail(ctx, 'calendar_edit');
    const eventId = decodeURIComponent(url.pathname.split('/').pop() ?? '');
    const body = await readJsonBody(req);
    try {
      const event = await updateEvent({
        familyId: ctx.member.familyId,
        actorMemberId: ctx.member.id,
        eventId,
        patch: {
          title: body?.title,
          description: body?.description,
          location: body?.location,
          startsAt: body?.startsAt,
          endsAt: body?.endsAt,
          allDay: body?.allDay,
          rruleText: body?.rruleText,
          attendeeMemberIds: body?.attendeeMemberIds
        },
        expectedEtag: body?.expectedEtag ?? null
      });
      if (event.calendarId && event.calendarId !== 'internal') {
        await mirrorEventUpsert({
          familyId: ctx.member.familyId,
          actorMemberId: ctx.member.id,
          memberId: ctx.member.id,
          event
        }).catch(() => {});
      }
      sendJson(res, clientOrigin, 200, { event });
    } catch (err) {
      if (err.message === 'concurrent_modification') {
        sendJson(res, clientOrigin, 409, { error: 'concurrent_modification', detail: err.detail });
        return;
      }
      throw err;
    }
    return;
  }

  if (url.pathname.startsWith('/api/v2/events/') && req.method === 'DELETE') {
    const ctx = await resolveRequestContext(req);
    requirePermissionOrFail(ctx, 'calendar_edit');
    const eventId = decodeURIComponent(url.pathname.split('/').pop() ?? '');
    await deleteEvent({
      familyId: ctx.member.familyId,
      actorMemberId: ctx.member.id,
      eventId
    });
    sendJson(res, clientOrigin, 200, { ok: true });
    return;
  }

  if (url.pathname === '/api/v2/task-lists' && req.method === 'GET') {
    const ctx = await resolveRequestContext(req);
    if (!ctx) {
      sendJson(res, clientOrigin, 401, { error: 'unauthorized' });
      return;
    }
    sendJson(res, clientOrigin, 200, { lists: await listTaskLists(ctx.member.familyId) });
    return;
  }

  if (url.pathname === '/api/v2/task-lists' && req.method === 'POST') {
    const ctx = await resolveRequestContext(req);
    requirePermissionOrFail(ctx, 'task_edit');
    const body = await readJsonBody(req);
    const list = await createTaskList({
      familyId: ctx.member.familyId,
      name: String(body?.name ?? '').trim() || 'Untitled list',
      ordinal: Number(body?.ordinal ?? 0)
    });
    sendJson(res, clientOrigin, 201, { list });
    return;
  }

  if (url.pathname.startsWith('/api/v2/task-lists/') && req.method === 'DELETE') {
    const ctx = await resolveRequestContext(req);
    requirePermissionOrFail(ctx, 'task_edit');
    const listId = decodeURIComponent(url.pathname.split('/').pop() ?? '');
    await deleteTaskList({ familyId: ctx.member.familyId, listId });
    sendJson(res, clientOrigin, 200, { ok: true });
    return;
  }

  if (url.pathname === '/api/v2/tasks' && req.method === 'GET') {
    const ctx = await resolveRequestContext(req);
    if (!ctx) {
      sendJson(res, clientOrigin, 401, { error: 'unauthorized' });
      return;
    }
    const tasks = await listTasks({
      familyId: ctx.member.familyId,
      listId: url.searchParams.get('listId') || undefined,
      ownerMemberId: url.searchParams.get('ownerMemberId') || undefined,
      includeArchived: url.searchParams.get('includeArchived') === 'true'
    });
    sendJson(res, clientOrigin, 200, { tasks });
    return;
  }

  if (url.pathname === '/api/v2/tasks' && req.method === 'POST') {
    const ctx = await resolveRequestContext(req);
    requirePermissionOrFail(ctx, 'task_edit');
    const body = await readJsonBody(req);
    const task = await createTask({
      familyId: ctx.member.familyId,
      actorMemberId: ctx.member.id,
      task: {
        title: String(body?.title ?? '').trim() || 'Untitled task',
        notes: body?.notes ?? null,
        listId: body?.listId ?? null,
        parentTaskId: body?.parentTaskId ?? null,
        ownerMemberId: body?.ownerMemberId ?? ctx.member.id,
        shared: Boolean(body?.shared),
        dueDate: body?.dueDate ?? null,
        recurrence: body?.recurrence,
        rruleText: body?.rruleText ?? null,
        priority: body?.priority,
        rewardPoints: Number(body?.rewardPoints ?? 0)
      }
    });
    sendJson(res, clientOrigin, 201, { task });
    return;
  }

  if (url.pathname.startsWith('/api/v2/tasks/') && url.pathname.endsWith('/complete') && req.method === 'POST') {
    const ctx = await resolveRequestContext(req);
    if (!ctx) {
      sendJson(res, clientOrigin, 401, { error: 'unauthorized' });
      return;
    }
    const segments = url.pathname.split('/');
    const taskId = decodeURIComponent(segments[segments.length - 2] ?? '');
    const result = await completeTask({
      familyId: ctx.member.familyId,
      actorMemberId: ctx.member.id,
      taskId
    });
    sendJson(res, clientOrigin, 200, result);
    return;
  }

  if (url.pathname.startsWith('/api/v2/tasks/') && req.method === 'PATCH') {
    const ctx = await resolveRequestContext(req);
    requirePermissionOrFail(ctx, 'task_edit');
    const taskId = decodeURIComponent(url.pathname.split('/').pop() ?? '');
    const body = await readJsonBody(req);
    const task = await updateTask({
      familyId: ctx.member.familyId,
      actorMemberId: ctx.member.id,
      taskId,
      patch: {
        title: body?.title,
        notes: body?.notes,
        listId: body?.listId,
        parentTaskId: body?.parentTaskId,
        ownerMemberId: body?.ownerMemberId,
        shared: body?.shared,
        dueDate: body?.dueDate,
        recurrence: body?.recurrence,
        rruleText: body?.rruleText,
        priority: body?.priority,
        rewardPoints: body?.rewardPoints,
        archived: body?.archived
      }
    });
    sendJson(res, clientOrigin, 200, { task });
    return;
  }

  if (url.pathname.startsWith('/api/v2/tasks/') && req.method === 'DELETE') {
    const ctx = await resolveRequestContext(req);
    requirePermissionOrFail(ctx, 'task_edit');
    const taskId = decodeURIComponent(url.pathname.split('/').pop() ?? '');
    await deleteTask({
      familyId: ctx.member.familyId,
      actorMemberId: ctx.member.id,
      taskId
    });
    sendJson(res, clientOrigin, 200, { ok: true });
    return;
  }

  if (url.pathname === '/api/v2/avatar/points' && req.method === 'GET') {
    const ctx = await resolveRequestContext(req);
    if (!ctx) {
      sendJson(res, clientOrigin, 401, { error: 'unauthorized' });
      return;
    }
    const memberId = url.searchParams.get('memberId') ?? ctx.member.id;
    const sinceIso = url.searchParams.get('since') ?? null;
    const total = await getMemberPoints({
      familyId: ctx.member.familyId,
      memberId,
      sinceIso
    });
    sendJson(res, clientOrigin, 200, { memberId, total, since: sinceIso });
    return;
  }

  // ----- Attachments (Phase 3.4 + 3.11) ---------------------------------

  if (url.pathname === '/api/v2/uploads/sign' && req.method === 'POST') {
    const ctx = await resolveRequestContext(req);
    if (!ctx) {
      sendJson(res, clientOrigin, 401, { error: 'unauthorized' });
      return;
    }
    const body = await readJsonBody(req);
    const mimeType = String(body?.mimeType ?? '').trim();
    const byteSize = Number(body?.byteSize ?? 0);
    if (!mimeType || !byteSize) throw createHttpError(400, 'mimeType and byteSize required');
    if (byteSize > 50 * 1024 * 1024) throw createHttpError(413, 'attachment exceeds 50MB limit');

    const result = await createUploadUrl({
      familyId: ctx.member.familyId,
      memberId: ctx.member.id,
      mimeType,
      byteSize
    });
    sendJson(res, clientOrigin, 200, result);
    return;
  }

  if (url.pathname === '/api/v2/attachments' && req.method === 'POST') {
    const ctx = await resolveRequestContext(req);
    if (!ctx) {
      sendJson(res, clientOrigin, 401, { error: 'unauthorized' });
      return;
    }
    const body = await readJsonBody(req);
    if (!body?.storageKey || !body?.mimeType || !body?.byteSize) {
      throw createHttpError(400, 'storageKey, mimeType, byteSize required');
    }
    const attachment = await finalizeAttachment({
      familyId: ctx.member.familyId,
      uploaderId: ctx.member.id,
      storageKey: body.storageKey,
      mimeType: body.mimeType,
      byteSize: Number(body.byteSize),
      width: body.width ?? null,
      height: body.height ?? null,
      caption: body.caption ?? null,
      messageId: body.messageId ?? null,
      eventId: body.eventId ?? null,
      transactionId: body.transactionId ?? null,
      billId: body.billId ?? null
    });
    const readUrl = await buildAttachmentReadUrl(attachment.storageKey);
    sendJson(res, clientOrigin, 201, { attachment, readUrl });
    return;
  }

  if (url.pathname === '/api/v2/attachments' && req.method === 'GET') {
    const ctx = await resolveRequestContext(req);
    if (!ctx) {
      sendJson(res, clientOrigin, 401, { error: 'unauthorized' });
      return;
    }
    const list = await listAttachments({
      familyId: ctx.member.familyId,
      kind: url.searchParams.get('kind') || undefined,
      limit: Number(url.searchParams.get('limit') ?? 50),
      beforeIso: url.searchParams.get('before') || undefined
    });
    // Attach a read URL per row so the client can <img src=...> immediately.
    const withUrls = await Promise.all(
      list.map(async (att) => ({ ...att, readUrl: await buildAttachmentReadUrl(att.storageKey) }))
    );
    sendJson(res, clientOrigin, 200, { attachments: withUrls });
    return;
  }

  // ----- Realtime (Phase 3.3) -------------------------------------------

  if (url.pathname === '/api/v2/realtime/ticket' && req.method === 'POST') {
    const ctx = await resolveRequestContext(req);
    if (!ctx) {
      sendJson(res, clientOrigin, 401, { error: 'unauthorized' });
      return;
    }
    sendJson(res, clientOrigin, 200, {
      ticket: mintTicket({ familyId: ctx.member.familyId, memberId: ctx.member.id })
    });
    return;
  }

  if (url.pathname === '/api/v2/realtime' && req.method === 'GET') {
    const ticket = url.searchParams.get('ticket') ?? '';
    const verified = await verifyTicket(ticket);
    if (!verified) {
      sendJson(res, clientOrigin, 403, { error: 'invalid_ticket' });
      return;
    }
    openSseStream({
      req,
      res,
      clientOrigin,
      familyId: verified.familyId,
      memberId: verified.memberId,
      lastEventId: req.headers['last-event-id']
    });
    return; // do NOT call sendJson — SSE owns the response
  }

  // ----- Connective Chat (Phase 3) ---------------------------------------

  if (url.pathname === '/api/v2/threads' && req.method === 'GET') {
    const ctx = await resolveRequestContext(req);
    if (!ctx) {
      sendJson(res, clientOrigin, 401, { error: 'unauthorized' });
      return;
    }
    sendJson(res, clientOrigin, 200, {
      threads: await listVisibleThreads({
        familyId: ctx.member.familyId,
        memberId: ctx.member.id,
        roleKey: ctx.member.roleKey
      })
    });
    return;
  }

  if (url.pathname === '/api/v2/threads/direct' && req.method === 'POST') {
    const ctx = await resolveRequestContext(req);
    if (!ctx) {
      sendJson(res, clientOrigin, 401, { error: 'unauthorized' });
      return;
    }
    const body = await readJsonBody(req);
    const otherMemberId = String(body?.memberId ?? '');
    if (!otherMemberId) throw createHttpError(400, 'memberId required');
    const thread = await ensureDirectThread({
      familyId: ctx.member.familyId,
      memberA: ctx.member.id,
      memberB: otherMemberId
    });
    sendJson(res, clientOrigin, 200, { thread });
    return;
  }

  // /api/v2/threads/:threadId/messages
  // /api/v2/threads/:threadId/settings
  // /api/v2/threads/:threadId/read
  if (url.pathname.startsWith('/api/v2/threads/')) {
    const segments = url.pathname.split('/');
    const threadId = decodeURIComponent(segments[4] ?? '');
    const sub = segments[5];

    if (sub === 'messages' && req.method === 'GET') {
      const ctx = await resolveRequestContext(req);
      if (!ctx) {
        sendJson(res, clientOrigin, 401, { error: 'unauthorized' });
        return;
      }
      sendJson(res, clientOrigin, 200, {
        messages: await listMessages({
          familyId: ctx.member.familyId,
          threadId,
          limit: Number(url.searchParams.get('limit') ?? 50),
          beforeIso: url.searchParams.get('before')
        })
      });
      return;
    }

    if (sub === 'messages' && req.method === 'POST') {
      const ctx = await resolveRequestContext(req);
      if (!ctx) {
        sendJson(res, clientOrigin, 401, { error: 'unauthorized' });
        return;
      }
      const body = await readJsonBody(req);
      const thread = await getThread({ familyId: ctx.member.familyId, threadId });
      if (!thread) throw createHttpError(404, 'thread not found');

      // E2E threads: client must send body_ciphertext (base64). Object/
      // family-plaintext threads: bodyText. Server enforces the choice
      // matches threads.e2e_encrypted so a misbehaving client can't write
      // plaintext into a thread the family expects to be encrypted.
      const bodyText = thread.e2eEncrypted ? null : (body?.bodyText ?? null);
      const bodyCiphertext = thread.e2eEncrypted && body?.bodyCiphertextBase64
        ? Buffer.from(body.bodyCiphertextBase64, 'base64')
        : null;

      if (thread.e2eEncrypted) {
        if (!bodyCiphertext) throw createHttpError(400, 'bodyCiphertextBase64 required for E2E thread');
      } else {
        if (!bodyText || !bodyText.trim()) throw createHttpError(400, 'bodyText required');
        const moderation = await moderateText(bodyText);
        if (!moderation.ok) {
          // Insert as the user wrote it but immediately hide so parent_admin
          // can review. Audit trail captures provenance.
          const inserted = await insertMessage({
            familyId: ctx.member.familyId,
            threadId,
            authorMemberId: ctx.member.id,
            kind: 'text',
            bodyText
          });
          await hideMessage({
            familyId: ctx.member.familyId,
            messageId: inserted.id,
            reasons: moderation.reasons
          });
          sendJson(res, clientOrigin, 202, {
            moderated: true,
            reasons: moderation.reasons,
            messageId: inserted.id
          });
          return;
        }
      }

      const message = await insertMessage({
        familyId: ctx.member.familyId,
        threadId,
        authorMemberId: ctx.member.id,
        kind: 'text',
        bodyText,
        bodyCiphertext,
        attachments: Array.isArray(body?.attachments) ? body.attachments : []
      });

      // Realtime fan-out for already-connected clients (no app open
      // required): broadcast the inserted row to every SSE client in the
      // family. Push (slower path) is for offline / lock-screen.
      broadcast({
        type: 'message',
        familyId: ctx.member.familyId,
        threadId,
        message
      });
      // Best-effort push fan-out — never blocks the send.
      fanOutMessagePush({
        familyId: ctx.member.familyId,
        threadId,
        threadKind: thread.kind,
        e2eEncrypted: thread.e2eEncrypted,
        authorMemberId: ctx.member.id,
        authorDisplayName: ctx.member.displayName,
        bodyPreview: bodyText ? bodyText.slice(0, 80) : null,
        messageId: message.id
      }).catch(() => {});

      sendJson(res, clientOrigin, 201, { message });
      return;
    }

    if (sub === 'read' && req.method === 'POST') {
      const ctx = await resolveRequestContext(req);
      if (!ctx) {
        sendJson(res, clientOrigin, 401, { error: 'unauthorized' });
        return;
      }
      const body = await readJsonBody(req);
      await markThreadRead({
        familyId: ctx.member.familyId,
        threadId,
        memberId: ctx.member.id,
        atIso: body?.atIso ?? new Date().toISOString()
      });
      sendJson(res, clientOrigin, 200, { ok: true });
      return;
    }

    if (sub === 'settings' && req.method === 'POST') {
      const ctx = await resolveRequestContext(req);
      if (!ctx) {
        sendJson(res, clientOrigin, 401, { error: 'unauthorized' });
        return;
      }
      const body = await readJsonBody(req);
      // Mute applies to the active member; kid_visibility is a
      // parent_admin tool that targets a different member.
      if (body?.mutedUntilIso !== undefined) {
        await setThreadMute({
          familyId: ctx.member.familyId,
          threadId,
          memberId: ctx.member.id,
          mutedUntilIso: body.mutedUntilIso
        });
      }
      if (body?.kidVisibility) {
        if (ctx.member.roleKey !== 'parent_admin' && ctx.member.roleKey !== 'adult_editor') {
          throw createHttpError(403, 'only parents can set kid visibility');
        }
        await setThreadKidVisibility({
          familyId: ctx.member.familyId,
          threadId,
          memberId: body.kidVisibility.memberId,
          kidVisible: Boolean(body.kidVisibility.visible)
        });
      }
      sendJson(res, clientOrigin, 200, { ok: true });
      return;
    }
  }

  // /api/v2/messages/:messageId/reactions
  if (url.pathname.startsWith('/api/v2/messages/') && url.pathname.endsWith('/reactions')) {
    const ctx = await resolveRequestContext(req);
    if (!ctx) {
      sendJson(res, clientOrigin, 401, { error: 'unauthorized' });
      return;
    }
    const segments = url.pathname.split('/');
    const messageId = decodeURIComponent(segments[4] ?? '');
    const body = await readJsonBody(req);
    const emoji = String(body?.emoji ?? '').trim();
    if (!emoji) throw createHttpError(400, 'emoji required');

    if (req.method === 'POST') {
      await addReaction({ familyId: ctx.member.familyId, messageId, memberId: ctx.member.id, emoji });
      sendJson(res, clientOrigin, 201, { ok: true });
      return;
    }
    if (req.method === 'DELETE') {
      await removeReaction({ familyId: ctx.member.familyId, messageId, memberId: ctx.member.id, emoji });
      sendJson(res, clientOrigin, 200, { ok: true });
      return;
    }
  }

  if (url.pathname === '/api/chat/parse' && req.method === 'POST') {
    const ctx = await resolveRequestContext(req);
    if (!ctx) {
      sendJson(res, clientOrigin, 401, { error: 'unauthorized' });
      return;
    }
    const body = await readJsonBody(req);
    const text = String(body?.text ?? '').trim();
    const threadId = String(body?.threadId ?? '');
    if (!text || !threadId) throw createHttpError(400, 'threadId and text required');

    // Pull plan via family lookup so the quota matches the active tier.
    const { getPool } = await import('../db/pool.mjs');
    const { rows: planRows } = await getPool().query(
      `SELECT plan FROM families WHERE id = $1 LIMIT 1`,
      [ctx.member.familyId]
    );
    const plan = planRows[0]?.plan ?? 'free';

    const reservation = await reserveAiParse({ familyId: ctx.member.familyId, plan });
    if (!reservation.allowed) {
      sendJson(res, clientOrigin, 429, {
        error: 'quota_exceeded',
        used: reservation.used,
        limit: reservation.limit
      });
      return;
    }

    const result = await parseProposalIntent({
      familyId: ctx.member.familyId,
      threadId,
      plan,
      text
    });
    sendJson(res, clientOrigin, 200, { ...result, quota: reservation });
    return;
  }

  if (url.pathname === '/api/proposals' && req.method === 'POST') {
    const ctx = await resolveRequestContext(req);
    if (!ctx) {
      sendJson(res, clientOrigin, 401, { error: 'unauthorized' });
      return;
    }
    const body = await readJsonBody(req);
    const family = await loadFamilyMembers(ctx.member.familyId);
    try {
      const result = await proposeChange({
        familyId: ctx.member.familyId,
        proposer: { id: ctx.member.id, roleKey: ctx.member.roleKey, displayName: ctx.member.displayName },
        family,
        change: body?.change,
        entityId: String(body?.entityId ?? ''),
        threadId: body?.threadId ?? undefined
      });
      sendJson(res, clientOrigin, 201, result);
    } catch (err) {
      if (err.message === 'proposal_invalid') {
        sendJson(res, clientOrigin, 400, { error: 'proposal_invalid', errors: err.errors });
        return;
      }
      throw err;
    }
    return;
  }

  if (url.pathname.startsWith('/api/proposals/') && url.pathname.endsWith('/decision') && req.method === 'POST') {
    const ctx = await resolveRequestContext(req);
    if (!ctx) {
      sendJson(res, clientOrigin, 401, { error: 'unauthorized' });
      return;
    }
    const segments = url.pathname.split('/');
    const proposalId = decodeURIComponent(segments[segments.length - 2] ?? '');
    const body = await readJsonBody(req);
    const result = await decideOnProposal({
      familyId: ctx.member.familyId,
      proposalId,
      memberId: ctx.member.id,
      decision: body?.decision,
      actorRoleKey: ctx.member.roleKey,
      actorPermissions: ROLE_PERMISSIONS[ctx.member.roleKey] ?? []
    });
    sendJson(res, clientOrigin, 200, result);
    return;
  }

  if (url.pathname === '/api/push/action' && req.method === 'POST') {
    // Stateless: the SW POSTs from the lock screen with no Clerk session.
    // Authentication is the signed action token itself (Phase 3.9).
    const body = await readJsonBody(req);
    const token = String(body?.actionToken ?? '');
    const decision = body?.decision === 'agree' ? 'agree' : body?.decision === 'decline' ? 'decline' : null;
    const proposalId = String(body?.proposalId ?? '');
    if (!token || !decision || !proposalId) throw createHttpError(400, 'token, decision, proposalId required');

    const verified = verifyActionToken(token);
    if (!verified || verified.proposalId !== proposalId) {
      sendJson(res, clientOrigin, 403, { error: 'invalid_action_token' });
      return;
    }

    // Look up the member's role + permissions inline since we don't have
    // a Clerk session.
    const { getPool } = await import('../db/pool.mjs');
    const { rows } = await getPool().query(
      `SELECT family_id, role_key FROM family_members WHERE id = $1 LIMIT 1`,
      [verified.memberId]
    );
    if (!rows.length || rows[0].family_id !== verified.familyId) {
      sendJson(res, clientOrigin, 403, { error: 'member_not_in_family' });
      return;
    }
    const result = await decideOnProposal({
      familyId: verified.familyId,
      proposalId,
      memberId: verified.memberId,
      decision,
      actorRoleKey: rows[0].role_key,
      actorPermissions: ROLE_PERMISSIONS[rows[0].role_key] ?? []
    });
    sendJson(res, clientOrigin, 200, result);
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
