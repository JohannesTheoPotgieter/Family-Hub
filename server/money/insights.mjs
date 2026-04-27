// Spending insights + net worth (Phase 4.7 + 4.8).
//
// Two read paths used by the Money screen:
//   monthlyRollup(family, month)  — totals per category + kind for a
//                                    given YYYY-MM, plus a delta vs the
//                                    same family's previous month.
//   netWorth(family)              — current asset/debt/net cents from
//                                    bank_accounts + debts. The weekly
//                                    snapshot job (snapshotNetWorth)
//                                    persists into net_worth_snapshots
//                                    so the UI can render a trend.
//
// Currency: a multi-currency family's totals are converted to the
// family's display currency via fxRates.convertCents, falling back to
// "n/a" for currencies with no recent rate.

import { withFamilyContext } from '../db/pool.mjs';
import { latestRate } from './fxRates.mjs';

/**
 * @param {{ familyId: string, monthIso: string, displayCurrency?: string }} args
 */
export const monthlyRollup = async ({ familyId, monthIso, displayCurrency = 'ZAR' }) =>
  withFamilyContext(familyId, async (client) => {
    const { rows } = await client.query(
      `SELECT category, kind, currency, total_cents, tx_count
         FROM monthly_category_rollup
        WHERE family_id = current_family_id() AND month_iso = $1`,
      [monthIso]
    );

    const previousMonth = previousMonthIso(monthIso);
    const { rows: prevRows } = await client.query(
      `SELECT category, kind, currency, total_cents
         FROM monthly_category_rollup
        WHERE family_id = current_family_id() AND month_iso = $1`,
      [previousMonth]
    );
    const prevByKey = new Map(
      prevRows.map((r) => [`${r.category}|${r.kind}|${r.currency}`, Number(r.total_cents)])
    );

    const enriched = await Promise.all(
      rows.map(async (row) => {
        const total = Number(row.total_cents);
        const prev = prevByKey.get(`${row.category}|${row.kind}|${row.currency}`) ?? 0;
        // Convert to display currency for headline summing.
        const totalDisplay =
          row.currency === displayCurrency
            ? total
            : await latestRate({ base: row.currency, quote: displayCurrency }).then((rate) =>
                rate == null ? null : Math.round(total * rate)
              );
        return {
          category: row.category,
          kind: row.kind,
          currency: row.currency,
          totalCents: total,
          totalCentsDisplay: totalDisplay,
          txCount: Number(row.tx_count),
          deltaCents: total - prev,
          deltaPct: prev > 0 ? Math.round(((total - prev) / prev) * 100) : null
        };
      })
    );

    const inflow = enriched
      .filter((r) => r.kind === 'inflow' && r.totalCentsDisplay != null)
      .reduce((sum, r) => sum + r.totalCentsDisplay, 0);
    const outflow = enriched
      .filter((r) => r.kind === 'outflow' && r.totalCentsDisplay != null)
      .reduce((sum, r) => sum + r.totalCentsDisplay, 0);

    return {
      monthIso,
      displayCurrency,
      categories: enriched,
      summary: {
        inflowCents: inflow,
        outflowCents: outflow,
        spareCents: inflow - outflow
      }
    };
  });

const previousMonthIso = (monthIso) => {
  const [year, month] = monthIso.split('-').map(Number);
  const prev = new Date(Date.UTC(year, month - 2, 1));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`;
};

/**
 * @param {{ familyId: string, displayCurrency?: string }} args
 */
export const netWorth = async ({ familyId, displayCurrency = 'ZAR' }) =>
  withFamilyContext(familyId, async (client) => {
    const { rows: assetRows } = await client.query(
      `SELECT currency, COALESCE(SUM(last_balance_cents), 0)::bigint AS total
         FROM bank_accounts
        WHERE last_balance_cents IS NOT NULL
        GROUP BY currency`
    );
    const { rows: debtRows } = await client.query(
      `SELECT currency, COALESCE(SUM(principal_cents), 0)::bigint AS total
         FROM debts
        WHERE paid_off = false
        GROUP BY currency`
    );

    const sum = async (rows) => {
      let total = 0;
      for (const row of rows) {
        const cents = Number(row.total);
        if (row.currency === displayCurrency) {
          total += cents;
          continue;
        }
        const rate = await latestRate({ base: row.currency, quote: displayCurrency });
        if (rate == null) continue; // skip currencies without a rate
        total += Math.round(cents * rate);
      }
      return total;
    };
    const assetsCents = await sum(assetRows);
    const debtsCents = await sum(debtRows);
    return {
      displayCurrency,
      assetsCents,
      debtsCents,
      netCents: assetsCents - debtsCents
    };
  });

/**
 * Persist today's net-worth row. Called from the weekly BullMQ job;
 * idempotent on (family_id, snapshot_date).
 */
export const snapshotNetWorth = async ({ familyId, displayCurrency = 'ZAR' }) => {
  const snapshot = await netWorth({ familyId, displayCurrency });
  return withFamilyContext(familyId, async (client) => {
    await client.query(
      `INSERT INTO net_worth_snapshots (family_id, snapshot_date, assets_cents, debts_cents, net_cents, currency)
       VALUES ($1, current_date, $2, $3, $4, $5)
       ON CONFLICT (family_id, snapshot_date) DO UPDATE
         SET assets_cents = EXCLUDED.assets_cents,
             debts_cents = EXCLUDED.debts_cents,
             net_cents = EXCLUDED.net_cents,
             currency = EXCLUDED.currency`,
      [familyId, snapshot.assetsCents, snapshot.debtsCents, snapshot.netCents, displayCurrency]
    );
    return snapshot;
  });
};

export const listNetWorthHistory = async ({ familyId, sinceIso = null }) =>
  withFamilyContext(familyId, async (client) => {
    const conds = [];
    const values = [];
    if (sinceIso) {
      values.push(sinceIso);
      conds.push(`snapshot_date >= $${values.length}`);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const { rows } = await client.query(
      `SELECT snapshot_date, assets_cents, debts_cents, net_cents, currency
         FROM net_worth_snapshots ${where}
        ORDER BY snapshot_date`,
      values
    );
    return rows.map((r) => ({
      snapshotDate: r.snapshot_date,
      assetsCents: Number(r.assets_cents),
      debtsCents: Number(r.debts_cents),
      netCents: Number(r.net_cents),
      currency: r.currency
    }));
  });
