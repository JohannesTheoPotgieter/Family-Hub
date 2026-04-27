// BankProvider interface (Phase 4.4).
//
// One adapter per supported provider. Each adapter implements the same
// shape so the sync worker / mirror layer can speak to any provider via
// dispatch. Adapters live in their own files and self-register through
// `registerProvider` so adding (e.g.) Capitec or Nedbank later is just a
// new file + import — no central registry edit.
//
// Phase 4 ships:
//   - StitchProvider (primary; ZA banking)
//   - PlaidProvider (US/CA stub)
//   - TrueLayerProvider (UK/EU stub)
// Plus a 'manual' adapter for users importing statements (no API).
//
// Statement import already works (src/lib/family-hub/statementImport.ts);
// it doesn't go through this interface — it's the no-cost fallback that
// works in any country with no provider account at all.

/**
 * @typedef {{
 *   externalAccountId: string,
 *   accountLabel: string,
 *   currency: string,
 *   lastBalanceCents: number | null,
 *   externalName: string | null
 * }} BankAccount
 */

/**
 * @typedef {{
 *   externalId: string,
 *   title: string,
 *   amountCents: number,
 *   currency: string,
 *   txDate: string,
 *   kind: 'inflow' | 'outflow',
 *   category: string | null,
 *   merchantName: string | null
 * }} BankTransaction
 */

/**
 * @typedef {{
 *   id: 'stitch' | 'plaid' | 'truelayer',
 *   isConfigured: () => boolean,
 *   listAccounts: (tokens: object) => Promise<BankAccount[]>,
 *   listTransactions: (tokens: object, args: { externalAccountId: string, since?: string | null, cursor?: string | null }) =>
 *     Promise<{ transactions: BankTransaction[], nextCursor: string | null }>,
 *   refreshBalance: (tokens: object, externalAccountId: string) => Promise<{ balanceCents: number }>,
 *   onTokensRefreshed?: (next: object) => void
 * }} BankProvider
 */

const registry = new Map();

export const registerProvider = (/** @type {BankProvider} */ provider) => {
  registry.set(provider.id, provider);
};

export const getProvider = (id) => registry.get(id) ?? null;

export const listConfiguredProviders = () =>
  [...registry.values()].filter((p) => p.isConfigured()).map((p) => p.id);
