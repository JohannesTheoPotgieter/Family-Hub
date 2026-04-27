// TrueLayer stub (Phase 4.4 — UK / EU secondary).
//
// Same shape as Plaid: registered adapter, throws on invocation, ready
// for phase-5 internationalization. Stitch is the working primary today.

import { registerProvider } from './bankProvider.mjs';

const isConfigured = () =>
  Boolean(process.env.TRUELAYER_CLIENT_ID && process.env.TRUELAYER_CLIENT_SECRET);

const notImplemented = () => {
  const err = new Error('TrueLayer adapter is not yet implemented in this build');
  err.status = 501;
  throw err;
};

registerProvider({
  id: 'truelayer',
  isConfigured,
  listAccounts: notImplemented,
  listTransactions: notImplemented,
  refreshBalance: notImplemented
});

export { isConfigured };
