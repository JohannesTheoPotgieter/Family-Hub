import { createServer } from 'node:http';
import { randomUUID, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8787);
const clientOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5000';
const rawEncKey = (process.env.TOKEN_ENC_KEY ?? '').trim();
const encKey = Buffer.byteLength(rawEncKey) >= 32 ? Buffer.from(rawEncKey).subarray(0, 32) : null;
const dataFile = resolve(__dirname, '.family-hub-server.json');
const pendingStates = new Map();
const icsCache = new Map();

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

const providerLabel = {
  google: 'Google',
  microsoft: 'Outlook'
};
const defaultReturnTo = {
  google: `${clientOrigin}/?tab=Calendar&provider=google&connected=1`,
  microsoft: `${clientOrigin}/?tab=Calendar&provider=microsoft&connected=1`
};

const createHttpError = (status, message) => Object.assign(new Error(message), { status });
const requireEncKey = () => {
  if (!encKey) {
    throw createHttpError(500, 'TOKEN_ENC_KEY must be set to at least 32 characters before connecting Google or Outlook.');
  }
  return encKey;
};

const loadPersistedState = () => {
  if (!existsSync(dataFile)) {
    return { providers: {}, icsSubscriptions: [] };
  }
  try {
    return JSON.parse(readFileSync(dataFile, 'utf8'));
  } catch {
    return { providers: {}, icsSubscriptions: [] };
  }
};

const persistedState = loadPersistedState();

const savePersistedState = () => {
  writeFileSync(dataFile, JSON.stringify(persistedState, null, 2));
};

const encrypt = (raw) => {
  const key = requireEncKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(raw, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
};

const decrypt = (value) => {
  if (!value) return null;
  const key = requireEncKey();
  const raw = Buffer.from(value, 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
};

const readJsonBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
};

const corsHeaders = () => ({
  'Access-Control-Allow-Origin': clientOrigin,
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Credentials': 'true'
});

const sendJson = (res, status, data) => {
  res.writeHead(status, { 'Content-Type': 'application/json', ...corsHeaders() });
  res.end(JSON.stringify(data));
};

const sendError = (res, error) => {
  const status = typeof error?.status === 'number' ? error.status : 500;
  sendJson(res, status, { error: error?.message ?? 'Unexpected server error' });
};

const redirect = (res, location) => {
  res.writeHead(302, { location, ...corsHeaders() });
  res.end();
};

const normalizeDateTime = (value) => new Date(value).toISOString();
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

export const sanitizeReturnTo = (provider, requestedReturnTo) => {
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

  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw createHttpError(400, 'ICS subscriptions must use http:// or https:// links.');
  }
  if (parsed.username || parsed.password) {
    throw createHttpError(400, 'ICS URLs with embedded credentials are not allowed.');
  }
  if (parsed.hostname === 'localhost' || parsed.hostname.endsWith('.local')) {
    throw createHttpError(400, 'Local network ICS URLs are not allowed.');
  }
  if (isPrivateIpAddress(parsed.hostname)) {
    throw createHttpError(400, 'Private network ICS URLs are not allowed.');
  }

  try {
    const resolved = await lookup(parsed.hostname, { all: true });
    if (resolved.some((entry) => isPrivateIpAddress(entry.address))) {
      throw createHttpError(400, 'Private network ICS URLs are not allowed.');
    }
  } catch (error) {
    if (error?.status) throw error;
    throw createHttpError(400, 'That ICS URL could not be verified.');
  }

  return parsed.toString();
};

const localNoonFromDateOnly = (dateOnly) => {
  const [year, month, day] = dateOnly.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1, 12, 0, 0).toISOString();
};

const normalizeAllDayRange = (startDate, endDate) => ({
  start: { iso: localNoonFromDateOnly(startDate), allDay: true },
  end: { iso: localNoonFromDateOnly(endDate ?? startDate), allDay: true }
});

const normalizeGoogleEvent = (event, calendarId) => {
  const isAllDay = Boolean(event.start?.date);
  const allDay = isAllDay ? normalizeAllDayRange(event.start.date, event.end?.date) : undefined;
  return {
    id: event.id,
    provider: 'google',
    calendarId,
    title: event.summary ?? 'Untitled event',
    description: event.description,
    location: event.location,
    start: isAllDay ? allDay.start : { iso: normalizeDateTime(event.start?.dateTime), allDay: false },
    end: isAllDay ? allDay.end : { iso: normalizeDateTime(event.end?.dateTime ?? event.start?.dateTime), allDay: false },
    organizer: event.organizer?.email,
    url: event.htmlLink,
    updatedAtIso: event.updated,
    source: 'external'
  };
};

const normalizeMicrosoftEvent = (event, calendarId) => {
  const isAllDay = Boolean(event.isAllDay);
  const startValue = event.start?.dateTime ?? event.start?.date;
  const endValue = event.end?.dateTime ?? event.end?.date ?? startValue;
  return {
    id: event.id,
    provider: 'microsoft',
    calendarId,
    title: event.subject ?? 'Untitled event',
    description: event.bodyPreview,
    location: event.location?.displayName,
    start: isAllDay ? normalizeAllDayRange(startValue.slice(0, 10)).start : { iso: normalizeDateTime(startValue), allDay: false },
    end: isAllDay ? normalizeAllDayRange(endValue.slice(0, 10)).end : { iso: normalizeDateTime(endValue), allDay: false },
    organizer: event.organizer?.emailAddress?.address,
    url: event.webLink,
    updatedAtIso: event.lastModifiedDateTime,
    source: 'external'
  };
};

const parseIcsValueLine = (line) => {
  const separatorIndex = line.indexOf(':');
  const left = separatorIndex >= 0 ? line.slice(0, separatorIndex) : line;
  const value = separatorIndex >= 0 ? line.slice(separatorIndex + 1) : '';
  const [name, ...params] = left.split(';');
  return {
    name: name.toUpperCase(),
    params: Object.fromEntries(
      params.map((part) => {
        const [key, rawValue = ''] = part.split('=');
        return [key.toUpperCase(), rawValue.toUpperCase()];
      })
    ),
    value
  };
};

const parseIcsDate = (value, params) => {
  const isAllDay = params.VALUE === 'DATE' || /^\d{8}$/.test(value);
  if (isAllDay) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6));
    const day = Number(value.slice(6, 8));
    return { iso: new Date(year, month - 1, day, 12, 0, 0).toISOString(), allDay: true };
  }

  const raw = value.endsWith('Z') ? value.slice(0, -1) : value;
  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(4, 6));
  const day = Number(raw.slice(6, 8));
  const hour = Number(raw.slice(9, 11));
  const minute = Number(raw.slice(11, 13));
  const second = Number(raw.slice(13, 15) || '0');
  const date = value.endsWith('Z')
    ? new Date(Date.UTC(year, month - 1, day, hour, minute, second))
    : new Date(year, month - 1, day, hour, minute, second);
  return { iso: date.toISOString(), allDay: false };
};

const parseIcsEvents = (content, calendarId) => {
  const unfolded = content.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);
  const events = [];
  let current = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current?.start) {
        events.push({
          id: current.uid ?? `${calendarId}-${events.length + 1}`,
          provider: 'ics',
          calendarId,
          title: current.summary ?? 'Untitled event',
          description: current.description,
          location: current.location,
          start: current.start,
          end: current.end ?? current.start,
          url: current.url,
          source: 'external'
        });
      }
      current = null;
      continue;
    }
    if (!current || !line || line.startsWith('BEGIN:') || line.startsWith('END:')) continue;
    const parsed = parseIcsValueLine(line);
    if (parsed.name === 'SUMMARY') current.summary = parsed.value;
    if (parsed.name === 'DESCRIPTION') current.description = parsed.value.replace(/\\n/g, '\n');
    if (parsed.name === 'LOCATION') current.location = parsed.value;
    if (parsed.name === 'UID') current.uid = parsed.value;
    if (parsed.name === 'URL') current.url = parsed.value;
    if (parsed.name === 'DTSTART') current.start = parseIcsDate(parsed.value, parsed.params);
    if (parsed.name === 'DTEND') current.end = parseIcsDate(parsed.value, parsed.params);
  }

  return events;
};

const requireProviderConfig = (provider) => {
  const config = providerConfig[provider];
  if (!config.clientId || !config.clientSecret || !config.redirectUri || !encKey) {
    throw createHttpError(400, `${providerLabel[provider]} is not configured on the server yet.`);
  }
  return config;
};

const getStoredProviderAccount = (provider) => persistedState.providers[provider] ?? null;

const saveProviderAccount = (provider, tokens) => {
  const current = getStoredProviderAccount(provider) ?? {};
  persistedState.providers[provider] = {
    ...current,
    ...tokens,
    connectedAtIso: new Date().toISOString()
  };
  savePersistedState();
};

const clearProviderAccount = (provider) => {
  delete persistedState.providers[provider];
  savePersistedState();
};

const exchangeCodeForTokens = async (provider, code) => {
  const config = requireProviderConfig(provider);
  const tokenUrl = provider === 'google'
    ? 'https://oauth2.googleapis.com/token'
    : 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: config.redirectUri
  });
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });
  const data = await response.json();
  if (!response.ok) {
    throw createHttpError(502, data.error_description ?? data.error?.message ?? `Could not connect ${providerLabel[provider]}.`);
  }

  const existing = getStoredProviderAccount(provider);
  saveProviderAccount(provider, {
    accessTokenEnc: encrypt(data.access_token),
    refreshTokenEnc: data.refresh_token ? encrypt(data.refresh_token) : existing?.refreshTokenEnc,
    accessTokenExpiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000
  });
};

const refreshAccessToken = async (provider) => {
  const config = requireProviderConfig(provider);
  const account = getStoredProviderAccount(provider);
  const refreshToken = decrypt(account?.refreshTokenEnc);
  if (!refreshToken) {
    throw createHttpError(401, `Connect ${providerLabel[provider]} first.`);
  }

  const tokenUrl = provider === 'google'
    ? 'https://oauth2.googleapis.com/token'
    : 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  });
  if (provider === 'google') {
    params.set('redirect_uri', config.redirectUri);
  } else {
    params.set('scope', config.scope);
  }

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });
  const data = await response.json();
  if (!response.ok) {
    clearProviderAccount(provider);
    throw createHttpError(401, `${providerLabel[provider]} connection expired. Please reconnect.`);
  }

  saveProviderAccount(provider, {
    accessTokenEnc: encrypt(data.access_token),
    refreshTokenEnc: data.refresh_token ? encrypt(data.refresh_token) : account.refreshTokenEnc,
    accessTokenExpiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000
  });

  return data.access_token;
};

const getAccessToken = async (provider) => {
  const account = getStoredProviderAccount(provider);
  const currentToken = decrypt(account?.accessTokenEnc);
  if (currentToken && Number(account?.accessTokenExpiresAt ?? 0) > Date.now() + 60_000) {
    return currentToken;
  }
  return refreshAccessToken(provider);
};

const listCalendars = async (provider) => {
  if (provider === 'ics') {
    return persistedState.icsSubscriptions.map((subscription) => ({
      id: subscription.id,
      provider: 'ics',
      name: subscription.name,
      primary: false,
      readOnly: true
    }));
  }

  const accessToken = await getAccessToken(provider);
  if (provider === 'google') {
    const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const data = await response.json();
    if (!response.ok) throw createHttpError(response.status, data.error?.message ?? 'Could not load Google calendars.');
    return (data.items ?? []).map((item) => ({
      id: item.id,
      provider: 'google',
      name: item.summary,
      primary: item.primary,
      color: item.backgroundColor
    }));
  }

  const response = await fetch('https://graph.microsoft.com/v1.0/me/calendars', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await response.json();
  if (!response.ok) throw createHttpError(response.status, data.error?.message ?? 'Could not load Outlook calendars.');
  return (data.value ?? []).map((item) => ({
    id: item.id,
    provider: 'microsoft',
    name: item.name,
    primary: item.isDefaultCalendar
  }));
};

const listEvents = async (provider, calendarId, timeMin, timeMax) => {
  const accessToken = await getAccessToken(provider);
  if (provider === 'google') {
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?singleEvents=true&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await response.json();
    if (!response.ok) throw createHttpError(response.status, data.error?.message ?? 'Could not load Google events.');
    return (data.items ?? []).map((event) => normalizeGoogleEvent(event, calendarId));
  }

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendarId)}/calendarView?startDateTime=${encodeURIComponent(timeMin)}&endDateTime=${encodeURIComponent(timeMax)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await response.json();
  if (!response.ok) throw createHttpError(response.status, data.error?.message ?? 'Could not load Outlook events.');
  return (data.value ?? []).map((event) => normalizeMicrosoftEvent(event, calendarId));
};

const fetchIcsEvents = async (subscription) => {
  const cached = icsCache.get(subscription.id);
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.events;
  const response = await fetch(subscription.url, {
    headers: { 'User-Agent': 'Family Hub Calendar Sync' },
    redirect: 'error'
  });
  if (!response.ok) throw createHttpError(response.status, 'Could not download the ICS calendar.');
  const text = await response.text();
  const events = parseIcsEvents(text, subscription.id);
  icsCache.set(subscription.id, { at: Date.now(), events });
  return events;
};

export const server = createServer(async (req, res) => {
  try {
    if (!req.url) throw createHttpError(400, 'Missing request URL.');
    if (req.method === 'OPTIONS') {
      sendJson(res, 200, { ok: true });
      return;
    }

    const url = new URL(req.url, `http://localhost:${port}`);

    if (url.pathname === '/api/health') {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (url.pathname === '/api/provider-status') {
      const provider = url.searchParams.get('provider');
      if (provider !== 'google' && provider !== 'microsoft') throw createHttpError(400, 'Unknown calendar provider.');
      const config = providerConfig[provider];
      sendJson(res, 200, {
        configured: Boolean(config.clientId && config.clientSecret && config.redirectUri && encKey),
        connected: Boolean(getStoredProviderAccount(provider))
      });
      return;
    }

    if (url.pathname === '/api/auth/google/start') {
      const config = requireProviderConfig('google');
      const stateId = randomUUID();
      pendingStates.set(stateId, {
        provider: 'google',
        returnTo: sanitizeReturnTo('google', url.searchParams.get('returnTo'))
      });
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', config.clientId);
      authUrl.searchParams.set('redirect_uri', config.redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', config.scope);
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');
      authUrl.searchParams.set('state', stateId);
      redirect(res, authUrl.toString());
      return;
    }

    if (url.pathname === '/api/auth/microsoft/start') {
      const config = requireProviderConfig('microsoft');
      const stateId = randomUUID();
      pendingStates.set(stateId, {
        provider: 'microsoft',
        returnTo: sanitizeReturnTo('microsoft', url.searchParams.get('returnTo'))
      });
      const authUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
      authUrl.searchParams.set('client_id', config.clientId);
      authUrl.searchParams.set('redirect_uri', config.redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('response_mode', 'query');
      authUrl.searchParams.set('scope', config.scope);
      authUrl.searchParams.set('state', stateId);
      redirect(res, authUrl.toString());
      return;
    }

    if (url.pathname === '/api/auth/google/callback' || url.pathname === '/api/auth/microsoft/callback') {
      const stateId = url.searchParams.get('state') ?? '';
      const code = url.searchParams.get('code') ?? '';
      const pending = pendingStates.get(stateId);
      pendingStates.delete(stateId);
      if (!pending || !code) throw createHttpError(400, 'Calendar sign-in could not be completed.');
      await exchangeCodeForTokens(pending.provider, code);
      redirect(res, pending.returnTo);
      return;
    }

    if (url.pathname === '/api/calendars') {
      const provider = url.searchParams.get('provider');
      if (provider !== 'google' && provider !== 'microsoft' && provider !== 'ics') {
        throw createHttpError(400, 'Unknown calendar provider.');
      }
      const calendars = await listCalendars(provider);
      sendJson(res, 200, calendars);
      return;
    }

    if (url.pathname === '/api/events') {
      const provider = url.searchParams.get('provider');
      const calendarId = url.searchParams.get('calendarId') ?? '';
      const timeMin = url.searchParams.get('timeMin') ?? '';
      const timeMax = url.searchParams.get('timeMax') ?? '';
      if (provider !== 'google' && provider !== 'microsoft') throw createHttpError(400, 'Unknown calendar provider.');
      if (!calendarId || !timeMin || !timeMax) throw createHttpError(400, 'calendarId, timeMin, and timeMax are required.');
      const events = await listEvents(provider, calendarId, timeMin, timeMax);
      sendJson(res, 200, events);
      return;
    }

    if (url.pathname === '/api/ics/subscribe' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const name = String(body?.name ?? '').trim();
      const subscriptionUrl = await validateIcsSubscriptionUrl(String(body?.url ?? '').trim());
      if (!name || !subscriptionUrl) throw createHttpError(400, 'name and url are required.');
      const existing = persistedState.icsSubscriptions.find((item) => item.url === subscriptionUrl);
      if (existing) {
        sendJson(res, 200, { id: existing.id, name: existing.name });
        return;
      }
      const subscription = { id: randomUUID(), name, url: subscriptionUrl, createdAtIso: new Date().toISOString() };
      persistedState.icsSubscriptions.push(subscription);
      savePersistedState();
      sendJson(res, 200, { id: subscription.id, name: subscription.name });
      return;
    }

    if (url.pathname === '/api/ics/events') {
      const subscriptionId = url.searchParams.get('subscriptionId') ?? '';
      const subscription = persistedState.icsSubscriptions.find((item) => item.id === subscriptionId);
      if (!subscription) throw createHttpError(404, 'ICS subscription not found.');
      const events = await fetchIcsEvents(subscription);
      sendJson(res, 200, events);
      return;
    }

    if (url.pathname === '/api/reset' && req.method === 'POST') {
      persistedState.providers = {};
      persistedState.icsSubscriptions = [];
      icsCache.clear();
      savePersistedState();
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    sendError(res, error);
  }
});

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(port, () => {
    console.log(`Family Hub server listening on ${port}`);
  });
}
