// Plaid stub (Phase 4.4 — US / CA secondary provider).
//
// Stitch is the ZA-first primary; Plaid + TrueLayer ship as registered
// adapters so the dispatch layer compiles and the BankProvider contract
// is exercised, but the real network calls are deferred to phase-5
// internationalization. Each method throws when invoked so the routes
// surface a clear "not yet supported" error.

import { registerProvider } from './bankProvider.mjs';

const isConfigured = () => Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);

const notImplemented = () => {
  const err = new Error('Plaid adapter is not yet implemented in this build');
  err.status = 501;
  throw err;
};

registerProvider({
  id: 'plaid',
  isConfigured,
  listAccounts: notImplemented,
  listTransactions: notImplemented,
  refreshBalance: notImplemented
});

export { isConfigured };
