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

/**
 * Fetch a delta page from Google Calendar.
 *
 * Google's `events.list` accepts `syncToken` for incremental sync. On the
 * first run we omit it (and pass `singleEvents=false&showDeleted=true` so
 * we get cancelled-event tombstones). The returned `nextSyncToken` is what
 * the caller persists for the next round.
 *
 * @param {{
 *   tokens: object,
 *   calendarId: string,
 *   syncToken?: string | null,
 *   pageToken?: string | null,
 *   onTokensRefreshed?: (tokens: object) => void
 * }} args
 * @returns {Promise<{
 *   items: any[],
 *   nextPageToken: string | null,
 *   nextSyncToken: string | null,
 *   resyncRequired: boolean
 * }>}
 */
export const fetchGoogleDelta = async ({ tokens, calendarId, syncToken, pageToken, onTokensRefreshed }) => {
  const params = new URLSearchParams();
  if (syncToken) {
    params.set('syncToken', syncToken);
  } else {
    params.set('showDeleted', 'true');
    params.set('singleEvents', 'false');
    // Bound the initial scan: 60 days back, 365 days forward. Subsequent
    // syncs use the syncToken so this only matters once per connection.
    const now = Date.now();
    params.set('timeMin', new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString());
    params.set('timeMax', new Date(now + 365 * 24 * 60 * 60 * 1000).toISOString());
  }
  if (pageToken) params.set('pageToken', pageToken);
  params.set('maxResults', '250');

  return withGoogleRefresh(
    tokens,
    async (currentTokens) => {
      const url = `${GOOGLE_API}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`;
      try {
        const { body } = await fetchJson(url, { headers: googleAuthHeaders(currentTokens) });
        return {
          items: body.items ?? [],
          nextPageToken: body.nextPageToken ?? null,
          nextSyncToken: body.nextSyncToken ?? null,
          resyncRequired: false
        };
      } catch (err) {
        // 410 Gone means the syncToken expired (typically >7d idle). Caller
        // drops the token and re-runs without one to re-establish.
        if (err.status === 410) {
          return { items: [], nextPageToken: null, nextSyncToken: null, resyncRequired: true };
        }
        throw err;
      }
    },
    onTokensRefreshed
  );
};

/**
 * Register a Google Calendar watch channel so updates push to our webhook.
 * Channels expire after 7 days max — the sync worker re-establishes via
 * cron.
 *
 * @param {{
 *   tokens: object,
 *   calendarId: string,
 *   webhookUrl: string,
 *   channelId: string,
 *   token?: string,
 *   ttlSeconds?: number,
 *   onTokensRefreshed?: (tokens: object) => void
 * }} args
 */
export const watchGoogleCalendar = async ({
  tokens,
  calendarId,
  webhookUrl,
  channelId,
  token,
  ttlSeconds = 604800,
  onTokensRefreshed
}) => {
  return withGoogleRefresh(
    tokens,
    async (currentTokens) => {
      const url = `${GOOGLE_API}/calendars/${encodeURIComponent(calendarId)}/events/watch`;
      const { body } = await fetchJson(url, {
        method: 'POST',
        headers: googleAuthHeaders(currentTokens),
        body: JSON.stringify({
          id: channelId,
          type: 'web_hook',
          address: webhookUrl,
          token,
          params: { ttl: String(ttlSeconds) }
        })
      });
      return {
        channelId: body.id,
        resourceId: body.resourceId,
        expiration: body.expiration ? Number(body.expiration) : null
      };
    },
    onTokensRefreshed
  );
};

/**
 * Stop a Google watch channel — called when a connection is removed or a
 * channel is being rotated.
 */
export const stopGoogleChannel = async ({ tokens, channelId, resourceId, onTokensRefreshed }) =>
  withGoogleRefresh(
    tokens,
    async (currentTokens) => {
      await fetchJson(`${GOOGLE_API}/channels/stop`, {
        method: 'POST',
        headers: googleAuthHeaders(currentTokens),
        body: JSON.stringify({ id: channelId, resourceId })
      });
      return { ok: true };
    },
    onTokensRefreshed
  );

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

/**
 * Fetch a delta page from Microsoft Graph using `/me/calendarView/delta`.
 *
 * @param {{
 *   tokens: object,
 *   deltaLink?: string | null,
 *   onTokensRefreshed?: (tokens: object) => void
 * }} args
 * @returns {Promise<{
 *   items: any[],
 *   nextLink: string | null,
 *   deltaLink: string | null
 * }>}
 */
export const fetchMicrosoftDelta = async ({ tokens, deltaLink, onTokensRefreshed }) => {
  let url;
  if (deltaLink) {
    url = deltaLink;
  } else {
    const now = new Date();
    const start = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const end = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();
    url = `${GRAPH_API}/me/calendarView/delta?startDateTime=${encodeURIComponent(start)}&endDateTime=${encodeURIComponent(end)}`;
  }

  return withMicrosoftRefresh(
    tokens,
    async (currentTokens) => {
      const headers = msAuthHeaders(currentTokens);
      // Graph returns up to 1000 entries per page by default; we leave
      // pagination to the caller via @odata.nextLink.
      const { body } = await fetchJson(url, { headers });
      return {
        items: body.value ?? [],
        nextLink: body['@odata.nextLink'] ?? null,
        deltaLink: body['@odata.deltaLink'] ?? null
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
