import { sanitizeReturnTo as sanitizeReturnToBase } from '../security.mjs';

export const createAuthBootstrap = ({ port, clientOrigin }) => {
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
  const sanitizeReturnTo = (provider, requestedReturnTo) => sanitizeReturnToBase(provider, requestedReturnTo, clientOrigin, defaultReturnTo);

  return { providerConfig, providerLabel, defaultReturnTo, sanitizeReturnTo, sanitizeReturnToBase };
};

export const buildProviderAuthUrl = ({ provider, providerConfig, stateId }) => {
  const authUrl = new URL(provider === 'google' ? 'https://accounts.google.com/o/oauth2/v2/auth' : 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
  const config = providerConfig[provider];
  authUrl.searchParams.set('client_id', config.clientId);
  authUrl.searchParams.set('redirect_uri', config.redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', config.scope);
  authUrl.searchParams.set('state', stateId);
  if (provider === 'google') {
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
  } else {
    authUrl.searchParams.set('response_mode', 'query');
  }
  return authUrl.toString();
};
