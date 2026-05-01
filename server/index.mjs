import { createHttpServer } from './bootstrap/http.mjs';
import { createAuthBootstrap } from './bootstrap/auth.mjs';
import { createRouteHandler } from './bootstrap/routes.mjs';
import { createRuntimeServices } from './bootstrap/runtime-services.mjs';
import { createSessionBootstrap } from './bootstrap/session.mjs';
import { createStartupEnvironment, startServerIfEntrypoint } from './bootstrap/startup-maintenance.mjs';
import { isPrivateIpAddress, validateIcsSubscriptionUrl } from './security.mjs';
import { autoMigrateIfEnabled } from './db/autoMigrate.mjs';

// Startup sequence is intentionally explicit:
// 1) resolve environment/runtime flags
// 2) hydrate storage/session state without mutating durable data
// 3) derive auth configuration and sanitizers
// 4) wire runtime services
// 5) register routes onto the HTTP server
const startup = createStartupEnvironment(import.meta.url);
const { port, clientOrigin, encKey, dataFile, maintenanceMode } = startup;
const { storage } = createSessionBootstrap({ dataFile, encKey });
const auth = createAuthBootstrap({ port, clientOrigin });
const { providerConfig, providerLabel, defaultReturnTo, sanitizeReturnTo, sanitizeReturnToBase } = auth;
const { providerService, icsService, oauthService } = createRuntimeServices({
  clientOrigin,
  providerConfig,
  providerLabel,
  defaultReturnTo,
  sanitizeReturnToBase,
  storage
});
const handleRequest = createRouteHandler({
  port,
  clientOrigin,
  encKey,
  maintenanceMode,
  providerConfig,
  storage,
  providerService,
  oauthService,
  icsService
});

export { isPrivateIpAddress, validateIcsSubscriptionUrl };
export const sanitizeReturnToPublic = sanitizeReturnTo;
export { sanitizeReturnToPublic as sanitizeReturnTo };

export const server = createHttpServer({ clientOrigin, handleRequest });

// Run pending migrations on boot so a fresh Replit / dev clone doesn't
// need a separate `node server/db/migrate.mjs` step. Idempotent — already-
// applied files are skipped. Disable via AUTO_MIGRATE=false.
autoMigrateIfEnabled().catch(() => {});

startServerIfEntrypoint({ moduleUrl: import.meta.url, server, port });
