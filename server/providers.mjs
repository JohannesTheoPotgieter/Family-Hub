import { normalizeGoogleEvent, normalizeMicrosoftEvent } from '../src/domain/calendar.ts';
import { createHttpError } from './security.mjs';

const localNoonFromDateOnly = (dateOnly) => {
  const [year, month, day] = dateOnly.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1, 12, 0, 0).toISOString();
};
const normalizeAllDayRange = (startDate, endDate) => ({
  start: { iso: localNoonFromDateOnly(startDate), allDay: true },
  end: { iso: localNoonFromDateOnly(endDate ?? startDate), allDay: true }
});

export const createProviderService = ({ providerConfig, providerLabel, storage }) => {
  const requireProviderConfig = (provider) => {
    const config = providerConfig[provider];
    if (!config.clientId || !config.clientSecret || !config.redirectUri || !storage.requireEncKey()) {
      throw createHttpError(400, `${providerLabel[provider]} is not configured on the server yet.`);
    }
    return config;
  };

  const exchangeCodeForTokens = async (provider, code) => {
    const config = requireProviderConfig(provider);
    const tokenUrl = provider === 'google' ? 'https://oauth2.googleapis.com/token' : 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
    const params = new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, code, grant_type: 'authorization_code', redirect_uri: config.redirectUri });
    const response = await fetch(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params });
    const data = await response.json();
    if (!response.ok) throw createHttpError(502, data.error_description ?? data.error?.message ?? `Could not connect ${providerLabel[provider]}.`);
    const existing = storage.getStoredProviderAccount(provider);
    storage.saveProviderAccount(provider, { accessTokenEnc: storage.encrypt(data.access_token), refreshTokenEnc: data.refresh_token ? storage.encrypt(data.refresh_token) : existing?.refreshTokenEnc, accessTokenExpiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000 });
  };

  const refreshAccessToken = async (provider) => {
    const config = requireProviderConfig(provider);
    const account = storage.getStoredProviderAccount(provider);
    const refreshToken = storage.decrypt(account?.refreshTokenEnc);
    if (!refreshToken) throw createHttpError(401, `Connect ${providerLabel[provider]} first.`);
    const tokenUrl = provider === 'google' ? 'https://oauth2.googleapis.com/token' : 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
    const params = new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' });
    if (provider === 'google') params.set('redirect_uri', config.redirectUri); else params.set('scope', config.scope);
    const response = await fetch(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params });
    const data = await response.json();
    if (!response.ok) {
      storage.clearProviderAccount(provider);
      throw createHttpError(401, `${providerLabel[provider]} connection expired. Please reconnect.`);
    }
    storage.saveProviderAccount(provider, { accessTokenEnc: storage.encrypt(data.access_token), refreshTokenEnc: data.refresh_token ? storage.encrypt(data.refresh_token) : account.refreshTokenEnc, accessTokenExpiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000 });
    return data.access_token;
  };

  const getAccessToken = async (provider) => {
    const account = storage.getStoredProviderAccount(provider);
    const currentToken = storage.decrypt(account?.accessTokenEnc);
    if (currentToken && Number(account?.accessTokenExpiresAt ?? 0) > Date.now() + 60_000) return currentToken;
    return refreshAccessToken(provider);
  };

  const listCalendars = async (provider) => {
    if (provider === 'ics') {
      return storage.persistedState.icsSubscriptions.map((subscription) => ({ id: subscription.id, provider: 'ics', name: subscription.name, primary: false, readOnly: true }));
    }
    const accessToken = await getAccessToken(provider);
    if (provider === 'google') {
      const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', { headers: { Authorization: `Bearer ${accessToken}` } });
      const data = await response.json();
      if (!response.ok) throw createHttpError(response.status, data.error?.message ?? 'Could not load Google calendars.');
      return (data.items ?? []).map((item) => ({ id: item.id, provider: 'google', name: item.summary, primary: item.primary, color: item.backgroundColor }));
    }
    const response = await fetch('https://graph.microsoft.com/v1.0/me/calendars', { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await response.json();
    if (!response.ok) throw createHttpError(response.status, data.error?.message ?? 'Could not load Outlook calendars.');
    return (data.value ?? []).map((item) => ({ id: item.id, provider: 'microsoft', name: item.name, primary: item.isDefaultCalendar }));
  };

  const listEvents = async (provider, calendarId, timeMin, timeMax) => {
    const accessToken = await getAccessToken(provider);
    if (provider === 'google') {
      const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?singleEvents=true&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      const data = await response.json();
      if (!response.ok) throw createHttpError(response.status, data.error?.message ?? 'Could not load Google events.');
      return (data.items ?? []).map((event) => normalizeGoogleEvent(event, calendarId));
    }
    const response = await fetch(`https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendarId)}/calendarView?startDateTime=${encodeURIComponent(timeMin)}&endDateTime=${encodeURIComponent(timeMax)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await response.json();
    if (!response.ok) throw createHttpError(response.status, data.error?.message ?? 'Could not load Outlook events.');
    return (data.value ?? []).map((event) => normalizeMicrosoftEvent(event, calendarId));
  };

  return { requireProviderConfig, exchangeCodeForTokens, listCalendars, listEvents };
};
