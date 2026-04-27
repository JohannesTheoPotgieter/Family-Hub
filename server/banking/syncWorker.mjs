// Bank account sync worker (Phase 4.4).
//
// One BullMQ queue ('bank-sync') with two job kinds:
//   poll-account   delta-list transactions for one (family, member,
//                   bank account) tuple via the registered provider.
//   refresh-balances  cheap hourly fanout to update lastBalanceCents.
//
// Provider tokens come from calendar_connections-style storage in
// bank_accounts.tokens_encrypted; we reuse the AES helpers from Phase 0.

import { buildWorker, getQueue, isQueuesConfigured } from '../queues/index.mjs';
import { getPool, withFamilyContext, withTransaction } from '../db/pool.mjs';
import { decryptToken, encryptToken } from '../security/tokenCrypto.mjs';
import './index.mjs'; // side-effect: register all providers
import { getProvider } from './bankProvider.mjs';

const QUEUE = 'bank-sync';
const ENC_KEY = () => process.env.TOKEN_ENC_KEY;

export const enqueueAccountPoll = async ({ familyId, accountId }) => {
  const queue = getQueue(QUEUE);
  if (!queue) return null;
  return queue.add(
    'poll-account',
    { familyId, accountId },
    {
      jobId: `bank-poll-${familyId}-${accountId}`,
      removeOnComplete: 50,
      removeOnFail: 100
    }
  );
};

export const startBankSyncWorker = ({ logger = console } = {}) => {
  if (!isQueuesConfigured()) {
    logger.log?.('[bank-sync] REDIS_URL not set; worker not started.');
    return null;
  }
  const worker = buildWorker(QUEUE, async (job) => {
    if (job.name === 'poll-account') return runAccountPoll(job.data, logger);
    logger.warn?.(`[bank-sync] unknown job kind: ${job.name}`);
  });
  if (!worker) return null;
  worker.on('failed', (job, err) => {
    logger.error?.(`[bank-sync] job ${job?.id} failed: ${err?.message}`);
  });
  return worker;
};

const runAccountPoll = async ({ familyId, accountId }, logger) => {
  return withFamilyContext(familyId, async (client) => {
    const { rows } = await client.query(
      `SELECT id, provider, external_account_id, tokens_encrypted, sync_cursor
         FROM bank_accounts WHERE id = $1 LIMIT 1`,
      [accountId]
    );
    if (!rows.length) return { skipped: true };
    const account = rows[0];
    const provider = getProvider(account.provider);
    if (!provider || !provider.isConfigured()) {
      logger.log?.(`[bank-sync] provider ${account.provider} not configured; skipping.`);
      return { skipped: true };
    }
    let tokens;
    try {
      const decoded = decryptToken(account.tokens_encrypted, ENC_KEY());
      tokens = decoded ? JSON.parse(decoded) : {};
    } catch {
      logger.error?.(`[bank-sync] could not decrypt tokens for account ${account.id}`);
      return { skipped: true };
    }

    let cursor = account.sync_cursor;
    let processed = 0;
    while (true) {
      let page;
      try {
        page = await provider.listTransactions(tokens, {
          externalAccountId: account.external_account_id,
          cursor
        });
      } catch (err) {
        logger.error?.(`[bank-sync] listTransactions failed for ${account.id}: ${err.message}`);
        break;
      }
      processed += await applyPage({ client, familyId, accountId: account.id, page });
      cursor = page.nextCursor;
      if (!cursor) break;
    }

    await client.query(
      `UPDATE bank_accounts SET sync_cursor = $2, last_synced_at = now()
        WHERE id = $1`,
      [account.id, cursor ?? null]
    );

    return { processed };
  });
};

const applyPage = async ({ client, familyId, accountId, page }) => {
  let inserted = 0;
  for (const tx of page.transactions ?? []) {
    if (!tx.externalId || !tx.txDate) continue;
    const { rowCount } = await client.query(
      `INSERT INTO transactions (
          family_id, title, amount_cents, currency, tx_date, kind,
          category, source, bank_account_id, statement_import_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'bank_link', $8, NULL)
       ON CONFLICT DO NOTHING`,
      [
        familyId,
        tx.title,
        tx.amountCents,
        tx.currency,
        tx.txDate,
        tx.kind,
        tx.category ?? 'Uncategorised',
        accountId
      ]
    );
    inserted += rowCount;
  }
  return inserted;
};

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const worker = startBankSyncWorker();
  if (!worker) process.exit(0);
  process.on('SIGTERM', () => worker.close());
  process.on('SIGINT', () => worker.close());
}

// Re-export the AES helpers so a future connection-wizard module can
// store tokens via:
//   tokens_encrypted = encryptToken(JSON.stringify(payload), encKey)
export { encryptToken };
