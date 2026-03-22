import { randomUUID } from 'node:crypto';

export const createOauthService = ({ clientOrigin, providerConfig, defaultReturnTo, providerService, redirect, sanitizeReturnTo }) => {
  const pendingStates = new Map();
  const startAuth = (res, provider, label) => {
    providerService.requireProviderConfig(provider);
    const stateId = randomUUID();
    pendingStates.set(stateId, { provider, returnTo: sanitizeReturnTo(provider, null, clientOrigin, defaultReturnTo) });
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
    redirect(res, clientOrigin, authUrl.toString());
  };
  const registerReturnTo = (provider, returnTo) => {
    const stateId = randomUUID();
    pendingStates.set(stateId, { provider, returnTo: sanitizeReturnTo(provider, returnTo, clientOrigin, defaultReturnTo) });
    return stateId;
  };
  const completeAuth = async (stateId, code) => {
    const pending = pendingStates.get(stateId);
    pendingStates.delete(stateId);
    if (!pending || !code) throw Object.assign(new Error('Calendar sign-in could not be completed.'), { status: 400 });
    await providerService.exchangeCodeForTokens(pending.provider, code);
    return pending.returnTo;
  };
  return { registerReturnTo, completeAuth };
};
