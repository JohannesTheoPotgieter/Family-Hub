import { normalizeGoogleEvent, normalizeMicrosoftEvent, type NormalizedCalendar } from '../../domain/calendar';
import { parseIcsText } from './icsParser';
import type { CalendarConnectInput, CalendarProviderClient } from './types';

const mode = (import.meta.env.VITE_CALENDAR_MODE ?? 'local') as 'local' | 'server';
const apiBase = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/calendar.readonly';
const MICROSOFT_CLIENT_ID = import.meta.env.VITE_MICROSOFT_CLIENT_ID ?? '';
const MICROSOFT_SCOPES = 'Calendars.Read User.Read';
const memTokens = new Map<string, string>();
const serverProviderLabel: Record<'google' | 'microsoft', string> = {
  google: 'Google',
  microsoft: 'Outlook'
};

type IcsSubscription = { id: string; name: string; url: string };

const buildApiUrl = (path: string) => `${apiBase}${path}`;
const canReachServer = () => Boolean(apiBase);
const getOAuthRedirectUri = (provider: 'google' | 'microsoft') =>
  `${window.location.origin}/oauth-callback.html?provider=${provider}`;

const readToken = (key: string) => memTokens.get(key) ?? sessionStorage.getItem(`fh-token:${key}`);
const saveToken = (key: string, token: string) => {
  memTokens.set(key, token);
  sessionStorage.setItem(`fh-token:${key}`, token);
};
const clearToken = (key: string) => {
  memTokens.delete(key);
  sessionStorage.removeItem(`fh-token:${key}`);
};

const readIcsSubscriptions = (): IcsSubscription[] => {
  const raw = sessionStorage.getItem('fh-ics-subs') ?? '[]';
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveIcsSubscriptions = (subscriptions: IcsSubscription[]) => {
  sessionStorage.setItem('fh-ics-subs', JSON.stringify(subscriptions));
};

const readJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof (data as { error?: unknown })?.error === 'string' ? (data as { error: string }).error : `Request failed (${response.status})`;
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
  if (!canReachServer()) throw new Error('oauth_unavailable');
  const status = await readJson<{ configured: boolean }>(buildApiUrl(`/api/provider-status?provider=${provider}`));
  if (!status.configured) {
    throw new Error(`${serverProviderLabel[provider]} sign-in is not configured on the server yet.`);
  }
};

const openOAuthPopup = (
  provider: 'google' | 'microsoft',
  authorizeUrl: string,
  clientId: string,
  scope: string
): Promise<string> =>
  new Promise((resolve, reject) => {
    if (!clientId) {
      reject(new Error(`${provider.toUpperCase()}_CLIENT_ID not configured. Add VITE_${provider.toUpperCase()}_CLIENT_ID to your environment.`));
      return;
    }

    const state = crypto.randomUUID();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: getOAuthRedirectUri(provider),
      response_type: 'token',
      scope,
      state,
      ...(provider === 'google' ? { include_granted_scopes: 'true' } : {})
    });

    const popup = window.open(`${authorizeUrl}?${params.toString()}`, `${provider}-oauth`, 'width=520,height=620,resizable,scrollbars');
    if (!popup) {
      reject(new Error('Popup was blocked. Please allow popups for this site.'));
      return;
    }

    const timer = window.setInterval(() => {
      if (!popup.closed) return;
      window.clearInterval(timer);
      window.removeEventListener('message', listener);
      reject(new Error('Sign-in window was closed.'));
    }, 500);

    const listener = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'oauth-token' && event.data?.provider === provider) {
        window.clearInterval(timer);
        window.removeEventListener('message', listener);
        resolve(event.data.token as string);
      }
      if (event.data?.type === 'oauth-error') {
        window.clearInterval(timer);
        window.removeEventListener('message', listener);
        reject(new Error(event.data.message ?? `${serverProviderLabel[provider]} sign-in failed.`));
      }
    };

    window.addEventListener('message', listener);
  });

const openGoogleOAuthPopup = () =>
  openOAuthPopup('google', 'https://accounts.google.com/o/oauth2/v2/auth', GOOGLE_CLIENT_ID, GOOGLE_SCOPES);

const openMicrosoftOAuthPopup = () =>
  openOAuthPopup('microsoft', 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize', MICROSOFT_CLIENT_ID, MICROSOFT_SCOPES);

const googleClient: CalendarProviderClient = {
  provider: 'google',
  label: 'Google',
  isAvailable: () => true,
  async connect(input) {
    if (mode === 'server' && !input?.accessToken?.trim()) {
      await ensureServerProviderReady('google');
      window.location.href = buildApiUrl(`/api/auth/google/start?returnTo=${encodeURIComponent(buildReturnToUrl('google'))}`);
      return;
    }

    if (input?.accessToken?.trim()) {
      requireAccessToken('google', input);
      return;
    }

    const token = await openGoogleOAuthPopup();
    saveToken('google', token);
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
    if (mode === 'server' && !input?.accessToken?.trim()) {
      await ensureServerProviderReady('microsoft');
      window.location.href = buildApiUrl(`/api/auth/microsoft/start?returnTo=${encodeURIComponent(buildReturnToUrl('microsoft'))}`);
      return;
    }

    if (input?.accessToken?.trim()) {
      requireAccessToken('microsoft', input);
      return;
    }

    const token = await openMicrosoftOAuthPopup();
    saveToken('microsoft', token);
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

const appleClient: CalendarProviderClient = {
  provider: 'ics',
  label: 'Apple Calendar',
  isAvailable: () => true,
  async connect(input) {
    const url = input?.url?.trim();
    if (!url) throw new Error('Paste your iCloud calendar sharing link to connect.');
    const cleanUrl = url.replace(/^webcal:\/\//i, 'https://');
    const subscriptions = readIcsSubscriptions();
    const id = `ics-${Date.now()}`;
    subscriptions.push({ id, name: input?.name?.trim() || 'Apple Calendar', url: cleanUrl });
    saveIcsSubscriptions(subscriptions);
    saveToken(`ics-${id}`, cleanUrl);
  },
  async disconnect(calendarId) {
    if (!calendarId) return;
    clearToken(`ics-${calendarId}`);
    const subscriptions = readIcsSubscriptions().filter((item) => item.id !== calendarId);
    saveIcsSubscriptions(subscriptions);
  },
  async listCalendars() {
    return readIcsSubscriptions().map((subscription) => ({
      id: subscription.id,
      provider: 'ics',
      name: subscription.name,
      primary: false,
      readOnly: true
    }));
  },
  async listEvents({ calendarId, timeMinIso, timeMaxIso }) {
    const subscription = readIcsSubscriptions().find((item) => item.id === calendarId);
    if (!subscription) return [];
    const response = await fetch(subscription.url);
    if (!response.ok) throw new Error('Could not fetch iCloud calendar. Check the link.');
    const text = await response.text();
    return parseIcsText(text, calendarId, timeMinIso, timeMaxIso);
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
  async disconnect(calendarId?: string) {
    if (mode !== 'server' || !calendarId) return;
    await readJson(buildApiUrl(`/api/ics/subscriptions/${encodeURIComponent(calendarId)}`), { method: 'DELETE' });
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
  sessionStorage.removeItem('fh-ics-subs');
};

export const resetCalendarConnections = async () => {
  clearCalendarClientStorage();
  if (mode !== 'server') return;
  try {
    await fetch(buildApiUrl('/api/reset'), { method: 'POST', headers: { 'Content-Type': 'application/json' } });
  } catch {
    return;
  }
};

export const getCalendarProviderClients = () => {
  const clients = [googleClient, microsoftClient, ...(mode === 'local' ? [appleClient] : []), icsClient];
  return clients.filter((provider) => provider.isAvailable());
};

export const hasCalendarOAuthConfig = (provider: 'google' | 'microsoft') =>
  provider === 'google' ? Boolean(GOOGLE_CLIENT_ID.trim()) : Boolean(MICROSOFT_CLIENT_ID.trim());
