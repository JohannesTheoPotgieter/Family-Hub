// Daily FX rate snapshot + lookup (Phase 4.5).
//
// Source: exchangerate.host (free, no key required, 1000 req/mo for the
// snapshot job is plenty since we only fetch once/day per base currency).
// Operator can override with FX_PROVIDER_URL for self-hosted feeds.
//
// Reports use this for display-time conversion only — money is stored at
// write-time in its native currency, never pre-converted.

import { getPool, withFamilyContext } from '../db/pool.mjs';

const today = () => new Date().toISOString().slice(0, 10);

const SOURCE = process.env.FX_PROVIDER_URL ?? 'https://api.exchangerate.host/latest';

/**
 * Fetch and persist today's rates for `base` → every supported quote.
 * Returns { inserted, base, day } so the caller can log.
 */
export const snapshotRates = async ({ base = 'ZAR', quotes = ['USD', 'EUR', 'GBP'] } = {}) => {
  const url = `${SOURCE}?base=${encodeURIComponent(base)}&symbols=${quotes.join(',')}`;
  const response = await fetch(url);
  if (!response.ok) {
    const err = new Error(`fx provider ${response.status}`);
    err.status = response.status;
    throw err;
  }
  const body = await response.json();
  const rates = body?.rates ?? {};
  const day = today();
  const pool = getPool();
  let inserted = 0;
  for (const [quote, rate] of Object.entries(rates)) {
    if (typeof rate !== 'number' || !Number.isFinite(rate)) continue;
    const { rowCount } = await pool.query(
      `INSERT INTO currency_rates (base_currency, quote_currency, day_iso, rate, source)
       VALUES ($1, $2, $3, $4, 'exchangerate.host')
       ON CONFLICT (base_currency, quote_currency, day_iso) DO UPDATE
         SET rate = EXCLUDED.rate, fetched_at = now()`,
      [base, quote, day, rate]
    );
    inserted += rowCount;
  }
  return { inserted, base, day };
};

/**
 * Latest known rate for base → quote, falling back to the most recent
 * row in the table. Returns 1.0 when base === quote.
 */
export const latestRate = async ({ base, quote }) => {
  if (base === quote) return 1;
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT rate FROM currency_rates
      WHERE base_currency = $1 AND quote_currency = $2
      ORDER BY day_iso DESC
      LIMIT 1`,
    [base, quote]
  );
  return rows[0]?.rate ? Number(rows[0].rate) : null;
};

/**
 * Convert an amount in cents from `base` to `quote` using the latest
 * snapshot. Returns null when no rate is known.
 */
export const convertCents = async ({ amountCents, base, quote }) => {
  if (base === quote) return amountCents;
  const rate = await latestRate({ base, quote });
  if (rate == null) return null;
  return Math.round(amountCents * rate);
};
