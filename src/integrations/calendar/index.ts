import { normalizeGoogleEvent, normalizeMicrosoftEvent, type NormalizedCalendar } from '../../domain/calendar';
import type { CalendarConnectInput, CalendarProviderClient } from './types';

const mode = (import.meta.env.VITE_CALENDAR_MODE ?? 'local') as 'local' | 'server';
const apiBase = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
const memTokens = new Map<string, string>();
const serverProviderLabel: Record<'google' | 'microsoft', string> = {
  google: 'Google',
  microsoft: 'Outlook'
};

const buildApiUrl = (path: string) => `${apiBase}${path}`;

const readToken = (key: string) => memTokens.get(key) ?? sessionStorage.getItem(`fh-token:${key}`);
const saveToken = (key: string, token: string) => {
  memTokens.set(key, token);
  sessionStorage.setItem(`fh-token:${key}`, token);
};
const clearToken = (key: string) => {
  memTokens.delete(key);
  sessionStorage.removeItem(`fh-token:${key}`);
};

const readJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data?.error === 'string' ? data.error : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return data as T;
};

const requireAccessToken = (provider: 'google' | 'microsoft', input?: CalendarConnectInput) => {
  const token = input?.accessToken?.trim();
  if (!token) throw new Error(`Paste a ${provider === 'google' ? 'Google' : 'Microsoft'} access token first.`);
  saveToken(provider, token);
};

const buildReturnToUrl = (provider: 'google' | 'microsoft') => {
  const target = new URL(window.location.href);
  target.searchParams.set('tab', 'Calendar');
  target.searchParams.set('provider', provider);
  target.searchParams.set('connected', '1');
  return target.toString();
};

const ensureServerProviderReady = async (provider: 'google' | 'microsoft') => {
  const status = await readJson<{ configured: boolean }>(buildApiUrl(`/api/provider-status?provider=${provider}`));
  if (!status.configured) {
    throw new Error(`${serverProviderLabel[provider]} is not configured on the server yet.`);
  }
};

const googleClient: CalendarProviderClient = {
  provider: 'google',
  label: 'Google',
  isAvailable: () => true,
  async connect(input) {
    if (mode === 'server') {
      await ensureServerProviderReady('google');
      window.location.href = buildApiUrl(`/api/auth/google/start?returnTo=${encodeURIComponent(buildReturnToUrl('google'))}`);
      return;
    }
    requireAccessToken('google', input);
  },
  async disconnect() {
    clearToken('google');
  },
  async listCalendars() {
    if (mode === 'server') {
      return readJson<NormalizedCalendar[]>(buildApiUrl('/api/calendars?provider=google'));
    }
    const token = readToken('google');
    if (!token) throw new Error('Connect Google first.');
    const data = await readJson<any>('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: { Authorization: `Bearer ${token}` }
    });
    return (data.items ?? []).map((item: any) => ({
      id: item.id,
      provider: 'google',
      name: item.summary,
      primary: item.primary,
      color: item.backgroundColor
    }));
  },
  async listEvents({ calendarId, timeMinIso, timeMaxIso }) {
    if (mode === 'server') {
      return readJson(buildApiUrl(`/api/events?provider=google&calendarId=${encodeURIComponent(calendarId)}&timeMin=${encodeURIComponent(timeMinIso)}&timeMax=${encodeURIComponent(timeMaxIso)}`));
    }
    const token = readToken('google');
    if (!token) throw new Error('Connect Google first.');
    const data = await readJson<any>(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?singleEvents=true&timeMin=${encodeURIComponent(timeMinIso)}&timeMax=${encodeURIComponent(timeMaxIso)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return (data.items ?? []).map((event: any) => normalizeGoogleEvent(event, calendarId));
  }
};

const microsoftClient: CalendarProviderClient = {
  provider: 'microsoft',
  label: 'Outlook',
  isAvailable: () => true,
  async connect(input) {
    if (mode === 'server') {
      await ensureServerProviderReady('microsoft');
      window.location.href = buildApiUrl(`/api/auth/microsoft/start?returnTo=${encodeURIComponent(buildReturnToUrl('microsoft'))}`);
      return;
    }
    requireAccessToken('microsoft', input);
  },
  async disconnect() {
    clearToken('microsoft');
  },
  async listCalendars() {
    if (mode === 'server') {
      return readJson<NormalizedCalendar[]>(buildApiUrl('/api/calendars?provider=microsoft'));
    }
    const token = readToken('microsoft');
    if (!token) throw new Error('Connect Outlook first.');
    const data = await readJson<any>('https://graph.microsoft.com/v1.0/me/calendars', {
      headers: { Authorization: `Bearer ${token}` }
    });
    return (data.value ?? []).map((item: any): NormalizedCalendar => ({
      id: item.id,
      provider: 'microsoft',
      name: item.name,
      primary: item.isDefaultCalendar
    }));
  },
  async listEvents({ calendarId, timeMinIso, timeMaxIso }) {
    if (mode === 'server') {
      return readJson(buildApiUrl(`/api/events?provider=microsoft&calendarId=${encodeURIComponent(calendarId)}&timeMin=${encodeURIComponent(timeMinIso)}&timeMax=${encodeURIComponent(timeMaxIso)}`));
    }
    const token = readToken('microsoft');
    if (!token) throw new Error('Connect Outlook first.');
    const data = await readJson<any>(
      `https://graph.microsoft.com/v1.0/me/calendars/${calendarId}/calendarView?startDateTime=${encodeURIComponent(timeMinIso)}&endDateTime=${encodeURIComponent(timeMaxIso)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return (data.value ?? []).map((event: any) => normalizeMicrosoftEvent(event, calendarId));
  }
};

const icsClient: CalendarProviderClient = {
  provider: 'ics',
  label: 'ICS',
  isAvailable: () => mode === 'server',
  async connect(input) {
    if (mode !== 'server') throw new Error('ICS subscriptions need Server Mode.');
    if (!input?.name?.trim() || !input?.url?.trim()) throw new Error('Add a calendar name and ICS URL first.');
    await readJson(buildApiUrl('/api/ics/subscribe'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: input.name.trim(), url: input.url.trim() })
    });
  },
  async disconnect() {
    return;
  },
  async listCalendars() {
    if (mode !== 'server') return [];
    return readJson<NormalizedCalendar[]>(buildApiUrl('/api/calendars?provider=ics'));
  },
  async listEvents({ calendarId }) {
    if (mode !== 'server') return [];
    return readJson(buildApiUrl(`/api/ics/events?subscriptionId=${encodeURIComponent(calendarId)}`));
  }
};

export const getCalendarMode = () => mode;

export const clearCalendarClientStorage = () => {
  clearToken('google');
  clearToken('microsoft');
  sessionStorage.removeItem('fh-calendar:last-provider');
};

export const resetCalendarConnections = async () => {
  clearCalendarClientStorage();
  if (mode !== 'server') return;
  try {
    await fetch(buildApiUrl('/api/reset'), { method: 'POST' });
  } catch {
    return;
  }
};

export const getCalendarProviderClients = () => [googleClient, microsoftClient, icsClient].filter((provider) => provider.isAvailable());
