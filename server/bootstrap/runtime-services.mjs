import { createIcsService } from '../ics.mjs';
import { createOauthService } from '../oauth.mjs';
import { createProviderService } from '../providers.mjs';
import { redirect } from '../http.mjs';

export const createRuntimeServices = ({ clientOrigin, providerConfig, providerLabel, defaultReturnTo, sanitizeReturnToBase, storage }) => {
  // Ordering matters: providerService depends on storage, and oauthService depends on
  // both the provider service and the finalized return-to policy.
  const providerService = createProviderService({ providerConfig, providerLabel, storage });
  const icsService = createIcsService();
  const oauthService = createOauthService({
    clientOrigin,
    providerConfig,
    defaultReturnTo,
    providerService,
    redirect,
    sanitizeReturnTo: sanitizeReturnToBase
  });

  return { providerService, icsService, oauthService };
};
