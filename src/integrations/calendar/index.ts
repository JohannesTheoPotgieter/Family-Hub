import { normalizeGoogleEvent, normalizeMicrosoftEvent, type NormalizedCalendar } from '../../domain/calendar';
import type { CalendarProviderClient } from './types';

const mode = (import.meta.env.VITE_CALENDAR_MODE ?? 'local') as 'local' | 'server';
const memTokens = new Map<string, string>();

const readToken = (key: string) => memTokens.get(key) ?? sessionStorage.getItem(`fh-token:${key}`);
const saveToken = (key: string, token: string) => {
  memTokens.set(key, token);
  sessionStorage.setItem(`fh-token:${key}`, token);
};
const clearToken = (key: string) => {
  memTokens.delete(key);
  sessionStorage.removeItem(`fh-token:${key}`);
};

const googleClient: CalendarProviderClient = {
  provider: 'google',
  isAvailable: () => true,
  async connect() {
    if (mode === 'server') return void (location.href = '/api/auth/google/start');
    const token = prompt('Paste Google access token for local mode');
    if (token) saveToken('google', token);
  },
  async disconnect() { clearToken('google'); },
  async listCalendars() {
    if (mode === 'server') return fetch('/api/calendars?provider=google').then((r) => r.json());
    const token = readToken('google');
    if (!token) return [];
    const res = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    return (data.items ?? []).map((item: any) => ({ id: item.id, provider: 'google', name: item.summary, primary: item.primary, color: item.backgroundColor }));
  },
  async listEvents({ calendarId, timeMinIso, timeMaxIso }) {
    if (mode === 'server') return fetch(`/api/events?provider=google&calendarId=${encodeURIComponent(calendarId)}&timeMin=${timeMinIso}&timeMax=${timeMaxIso}`).then((r) => r.json());
    const token = readToken('google');
    if (!token) return [];
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?singleEvents=true&timeMin=${encodeURIComponent(timeMinIso)}&timeMax=${encodeURIComponent(timeMaxIso)}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    return (data.items ?? []).map((event: any) => normalizeGoogleEvent(event, calendarId));
  }
};

const microsoftClient: CalendarProviderClient = {
  provider: 'microsoft',
  isAvailable: () => true,
  async connect() {
    if (mode === 'server') return void (location.href = '/api/auth/microsoft/start');
    const token = prompt('Paste Microsoft Graph access token for local mode');
    if (token) saveToken('microsoft', token);
  },
  async disconnect() { clearToken('microsoft'); },
  async listCalendars() {
    if (mode === 'server') return fetch('/api/calendars?provider=microsoft').then((r) => r.json());
    const token = readToken('microsoft');
    if (!token) return [];
    const res = await fetch('https://graph.microsoft.com/v1.0/me/calendars', { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    return (data.value ?? []).map((item: any): NormalizedCalendar => ({ id: item.id, provider: 'microsoft', name: item.name, primary: item.isDefaultCalendar }));
  },
  async listEvents({ calendarId, timeMinIso, timeMaxIso }) {
    if (mode === 'server') return fetch(`/api/events?provider=microsoft&calendarId=${encodeURIComponent(calendarId)}&timeMin=${timeMinIso}&timeMax=${timeMaxIso}`).then((r) => r.json());
    const token = readToken('microsoft');
    if (!token) return [];
    const res = await fetch(`https://graph.microsoft.com/v1.0/me/calendars/${calendarId}/events?$filter=start/dateTime ge '${timeMinIso}' and end/dateTime le '${timeMaxIso}'`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    return (data.value ?? []).map((event: any) => normalizeMicrosoftEvent(event, calendarId));
  }
};

const unsupported = (provider: 'caldav' | 'ics', message: string): CalendarProviderClient => ({ provider, isAvailable: () => true, connect: async () => { throw new Error(message); }, disconnect: async () => undefined, listCalendars: async () => [], listEvents: async () => [] });

export const getCalendarMode = () => mode;
export const getCalendarProviderClients = () => [googleClient, microsoftClient, unsupported('caldav', mode === 'local' ? 'Apple requires Server Mode.' : 'Connect Apple via /api/caldav/connect.'), unsupported('ics', mode === 'local' ? 'ICS may fail from CORS in local mode. Use server mode.' : 'Connect ICS via /api/ics/subscribe.')];
