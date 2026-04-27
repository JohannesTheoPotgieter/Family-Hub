// Google + Microsoft Calendar API clients (Phase 1.4 — provider write-through).
//
// These are the thin network adapters the eventStore + sync worker use to
// mirror Family-Hub events to a connected Google or Microsoft calendar.
// We hand-roll fetch calls instead of pulling in `googleapis` /
// `@microsoft/microsoft-graph-client` so the dep surface stays small.
//
// Each client speaks NormalizedEvent in / NormalizedEvent out — serializers
// are owned by src/domain/calendar.ts so the wire shapes stay consistent
// with the read-side normalizers.
//
// Token refresh: when the access token comes back as 401, callers refresh
// via the refresh-token grant and retry once. Refreshed tokens are written
// back through `connectionStore.upsertCalendarConnection`.

import { serializeGoogleEvent, serializeMicrosoftEvent } from '../../src/domain/calendar.ts';

class ProviderError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

const fetchJson = async (url, init) => {
  const response = await fetch(url, init);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    throw new ProviderError(`provider request failed: ${response.status}`, {
      status: response.status,
      body
    });
  }
  return { body, etag: response.headers.get('etag') };
};

// --- Google Calendar -----------------------------------------------------
//
// Endpoints used:
//   POST  https://www.googleapis.com/calendar/v3/calendars/{calId}/events
//   PATCH https://www.googleapis.com/calendar/v3/calendars/{calId}/events/{id}
//   DELETE same as PATCH
//   POST  https://oauth2.googleapis.com/token   (refresh_token grant)
//
// `If-Match: <etag>` on PATCH/DELETE prevents trampling a remote edit we
// haven't pulled yet.

const GOOGLE_API = 'https://www.googleapis.com/calendar/v3';

const refreshGoogle = async (tokens) => {
  if (!tokens.refresh_token) throw new ProviderError('google refresh_token missing');
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? '',
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token
  });
  const { body } = await fetchJson('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  return {
    ...tokens,
    access_token: body.access_token,
    expires_at: Date.now() + (body.expires_in ?? 3600) * 1000
  };
};

const googleAuthHeaders = (tokens) => ({
  Authorization: `Bearer ${tokens.access_token}`,
  'Content-Type': 'application/json'
});

const withGoogleRefresh = async (tokens, fn, onTokensRefreshed) => {
  try {
    return await fn(tokens);
  } catch (err) {
    if (err.status !== 401) throw err;
    const refreshed = await refreshGoogle(tokens);
    onTokensRefreshed?.(refreshed);
    return fn(refreshed);
  }
};

/**
 * Create or update a Google Calendar event.
 *
 * @param {{
 *   tokens: object,
 *   calendarId: string,
 *   event: import('../../src/domain/calendar.ts').NormalizedEvent,
 *   etag?: string | null,
 *   onTokensRefreshed?: (tokens: object) => void
 * }} args
 */
export const upsertGoogleEvent = async ({ tokens, calendarId, event, etag, onTokensRefreshed }) => {
  const wire = serializeGoogleEvent(event);
  const isUpdate = Boolean(event.id);
  const url = isUpdate
    ? `${GOOGLE_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(event.id)}`
    : `${GOOGLE_API}/calendars/${encodeURIComponent(calendarId)}/events`;
  const method = isUpdate ? 'PATCH' : 'POST';

  return withGoogleRefresh(
    tokens,
    async (currentTokens) => {
      const headers = googleAuthHeaders(currentTokens);
      if (isUpdate && etag) headers['If-Match'] = etag;
      const { body, etag: nextEtag } = await fetchJson(url, {
        method,
        headers,
        body: JSON.stringify(wire)
      });
      return { remoteId: body.id, etag: nextEtag, raw: body };
    },
    onTokensRefreshed
  );
};

export const deleteGoogleEvent = async ({ tokens, calendarId, eventId, etag, onTokensRefreshed }) => {
  const url = `${GOOGLE_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  return withGoogleRefresh(
    tokens,
    async (currentTokens) => {
      const headers = googleAuthHeaders(currentTokens);
      if (etag) headers['If-Match'] = etag;
      // Google returns 204 (no body) on success — fetchJson handles empty.
      await fetchJson(url, { method: 'DELETE', headers });
      return { ok: true };
    },
    onTokensRefreshed
  );
};

// --- Microsoft Graph -----------------------------------------------------
//
// Graph events live under /me/events or /users/{id}/events; Family-Hub
// uses the connected user's /me/events scope.

const GRAPH_API = 'https://graph.microsoft.com/v1.0';

const refreshMicrosoft = async (tokens) => {
  if (!tokens.refresh_token) throw new ProviderError('microsoft refresh_token missing');
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID ?? '',
    client_secret: process.env.MICROSOFT_CLIENT_SECRET ?? '',
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
    scope: 'offline_access Calendars.ReadWrite'
  });
  const { body } = await fetchJson(
    `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT ?? 'common'}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    }
  );
  return {
    ...tokens,
    access_token: body.access_token,
    refresh_token: body.refresh_token ?? tokens.refresh_token,
    expires_at: Date.now() + (body.expires_in ?? 3600) * 1000
  };
};

const msAuthHeaders = (tokens) => ({
  Authorization: `Bearer ${tokens.access_token}`,
  'Content-Type': 'application/json'
});

const withMicrosoftRefresh = async (tokens, fn, onTokensRefreshed) => {
  try {
    return await fn(tokens);
  } catch (err) {
    if (err.status !== 401) throw err;
    const refreshed = await refreshMicrosoft(tokens);
    onTokensRefreshed?.(refreshed);
    return fn(refreshed);
  }
};

export const upsertMicrosoftEvent = async ({ tokens, event, etag, onTokensRefreshed }) => {
  const wire = serializeMicrosoftEvent(event);
  const isUpdate = Boolean(event.id);
  const url = isUpdate
    ? `${GRAPH_API}/me/events/${encodeURIComponent(event.id)}`
    : `${GRAPH_API}/me/events`;
  const method = isUpdate ? 'PATCH' : 'POST';

  return withMicrosoftRefresh(
    tokens,
    async (currentTokens) => {
      const headers = msAuthHeaders(currentTokens);
      if (isUpdate && etag) headers['If-Match'] = etag;
      const { body, etag: nextEtag } = await fetchJson(url, {
        method,
        headers,
        body: JSON.stringify(wire)
      });
      return {
        remoteId: body.id,
        etag: nextEtag ?? body['@odata.etag'] ?? null,
        lastModifiedRemote: body.lastModifiedDateTime,
        raw: body
      };
    },
    onTokensRefreshed
  );
};

export const deleteMicrosoftEvent = async ({ tokens, eventId, etag, onTokensRefreshed }) => {
  const url = `${GRAPH_API}/me/events/${encodeURIComponent(eventId)}`;
  return withMicrosoftRefresh(
    tokens,
    async (currentTokens) => {
      const headers = msAuthHeaders(currentTokens);
      if (etag) headers['If-Match'] = etag;
      await fetchJson(url, { method: 'DELETE', headers });
      return { ok: true };
    },
    onTokensRefreshed
  );
};

export { ProviderError };
