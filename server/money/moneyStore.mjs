// Money entity stores (Phase 4 backend).
//
// Bills, budgets, debts, savings_goals, transactions — small CRUD layer
// that the proposal engine + the routes call. Same shape as eventStore /
// taskStore: tenant-scoped via withFamilyContext, every mutation writes
// an audit_log row, ensure*Thread helpers attach object threads on first
// open.
//
// Phase 4 routes for these entities will arrive in slice 4c — for now
// the proposal-apply path is the primary consumer.

import { withFamilyContext, withTransaction } from '../db/pool.mjs';

const audit = async (client, { familyId, actorMemberId, action, entityKind, entityId, diff }) => {
  await client.query(
    `INSERT INTO audit_log (family_id, actor_member_id, action, entity_kind, entity_id, diff)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [familyId, actorMemberId, action, entityKind, entityId, JSON.stringify(diff)]
  );
};

// --- budgets -------------------------------------------------------------

/**
 * Apply a "shift R X from category A → category B" change for a given
 * month. Idempotent: each side adjusts the existing row or creates one
 * with the delta. Returns { from, to } as the post-shift rows.
 *
 * @param {{
 *   familyId: string,
 *   actorMemberId: string,
 *   monthIso: string,
 *   fromCategory: string,
 *   toCategory: string,
 *   amountCents: number,
 *   currency: string
 * }} args
 */
export const shiftBudgetCategory = async ({
  familyId,
  actorMemberId,
  monthIso,
  fromCategory,
  toCategory,
  amountCents,
  currency
}) =>
  withFamilyContext(familyId, (client) =>
    withTransaction(client, async () => {
      const fromRow = await adjustBudgetRow(client, familyId, monthIso, fromCategory, -amountCents, currency);
      const toRow = await adjustBudgetRow(client, familyId, monthIso, toCategory, amountCents, currency);
      await audit(client, {
        familyId,
        actorMemberId,
        action: 'budget.shifted',
        entityKind: 'budget',
        entityId: toRow.id,
        diff: { fromCategory, toCategory, amountCents, currency, monthIso }
      });
      return { from: fromRow, to: toRow };
    })
  );

const adjustBudgetRow = async (client, familyId, monthIso, category, deltaCents, currency) => {
  const { rows: existing } = await client.query(
    `SELECT * FROM budgets
      WHERE family_id = $1 AND month_iso = $2 AND category = $3
      LIMIT 1
      FOR UPDATE`,
    [familyId, monthIso, category]
  );
  if (existing.length) {
    // pg returns bigint columns as strings; coerce before arithmetic.
    const current = Number(existing[0].limit_cents);
    const next = Math.max(0, current + deltaCents);
    const { rows } = await client.query(
      `UPDATE budgets SET limit_cents = $1 WHERE id = $2 RETURNING *`,
      [next, existing[0].id]
    );
    return rows[0];
  }
  // No existing row for this category in this month — create one with
  // max(0, deltaCents). The from-side might end up at 0 which is fine.
  const { rows } = await client.query(
    `INSERT INTO budgets (family_id, month_iso, category, limit_cents, currency)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [familyId, monthIso, category, Math.max(0, deltaCents), currency]
  );
  return rows[0];
};

// --- bills ---------------------------------------------------------------

/**
 * Insert an "extra payment" transaction tied to a bill. Doesn't touch the
 * bill itself; the recurring monthly bill is unchanged. The transaction
 * shows up alongside other outflows in the planner.
 */
export const recordBillExtraPayment = async ({
  familyId,
  actorMemberId,
  billId,
  extraAmountCents,
  currency
}) =>
  withFamilyContext(familyId, (client) =>
    withTransaction(client, async () => {
      const { rows: billRows } = await client.query(
        `SELECT title, category FROM bills WHERE id = $1 LIMIT 1`,
        [billId]
      );
      if (!billRows.length) {
        const err = new Error('bill not found');
        err.status = 404;
        throw err;
      }
      const bill = billRows[0];
      const today = new Date().toISOString().slice(0, 10);
      const { rows } = await client.query(
        `INSERT INTO transactions (family_id, title, amount_cents, currency, tx_date, kind,
                                    category, source, source_bill_id)
         VALUES ($1, $2, $3, $4, $5, 'outflow', $6, 'bill', $7)
         RETURNING *`,
        [
          familyId,
          `Extra: ${bill.title}`,
          extraAmountCents,
          currency,
          today,
          bill.category,
          billId
        ]
      );
      await audit(client, {
        familyId,
        actorMemberId,
        action: 'bill.extra_payment',
        entityKind: 'bill',
        entityId: billId,
        diff: { amountCents: extraAmountCents, currency, transactionId: rows[0].id }
      });
      return rows[0];
    })
  );

// --- debts ---------------------------------------------------------------

/**
 * Set the recurring monthly extra applied to this debt. Stored as a
 * column on the debt itself so the payoff-coach UI can read both the
 * minimum and the configured extra without joining transactions. The
 * actual payment lands as an outflow transaction the next time the bill
 * cycle runs (Phase 4 follow-up).
 */
export const setDebtAcceleration = async ({
  familyId,
  actorMemberId,
  debtId,
  monthlyExtraCents,
  currency
}) =>
  withFamilyContext(familyId, (client) =>
    withTransaction(client, async () => {
      const { rowCount, rows } = await client.query(
        `UPDATE debts
            SET min_payment_cents = (
                  SELECT min_payment_cents FROM debts WHERE id = $1
                ) + $2
          WHERE id = $1 AND family_id = $3
          RETURNING *`,
        [debtId, monthlyExtraCents, familyId]
      );
      if (!rowCount) {
        const err = new Error('debt not found');
        err.status = 404;
        throw err;
      }
      await audit(client, {
        familyId,
        actorMemberId,
        action: 'debt.acceleration_set',
        entityKind: 'debt',
        entityId: debtId,
        diff: { monthlyExtraCents, currency }
      });
      return rows[0];
    })
  );

// --- savings goals -------------------------------------------------------

export const contributeToGoal = async ({
  familyId,
  actorMemberId,
  goalId,
  amountCents,
  currency
}) =>
  withFamilyContext(familyId, (client) =>
    withTransaction(client, async () => {
      const { rowCount, rows } = await client.query(
        `UPDATE savings_goals
            SET saved_cents = saved_cents + $2
          WHERE id = $1 AND family_id = $3
          RETURNING *`,
        [goalId, amountCents, familyId]
      );
      if (!rowCount) {
        const err = new Error('savings goal not found');
        err.status = 404;
        throw err;
      }
      await audit(client, {
        familyId,
        actorMemberId,
        action: 'goal.contribution',
        entityKind: 'savings_goal',
        entityId: goalId,
        diff: { amountCents, currency }
      });
      return rows[0];
    })
  );

export const createGoal = async ({
  familyId,
  actorMemberId,
  title,
  targetCents,
  currency,
  targetDate
}) =>
  withFamilyContext(familyId, (client) =>
    withTransaction(client, async () => {
      const { rows } = await client.query(
        `INSERT INTO savings_goals (family_id, title, target_cents, currency, target_date)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [familyId, title, targetCents, currency, targetDate]
      );
      await audit(client, {
        familyId,
        actorMemberId,
        action: 'goal.created',
        entityKind: 'savings_goal',
        entityId: rows[0].id,
        diff: { title, targetCents, currency, targetDate }
      });
      return rows[0];
    })
  );

// --- one-off transactions -----------------------------------------------

export const insertOneOffTransaction = async ({
  familyId,
  actorMemberId,
  title,
  amountCents,
  currency,
  dateIso,
  flow
}) =>
  withFamilyContext(familyId, (client) =>
    withTransaction(client, async () => {
      const { rows } = await client.query(
        `INSERT INTO transactions (family_id, title, amount_cents, currency, tx_date, kind, source)
         VALUES ($1, $2, $3, $4, $5, $6, 'manual')
         RETURNING *`,
        [familyId, title, amountCents, currency, dateIso, flow]
      );
      await audit(client, {
        familyId,
        actorMemberId,
        action: flow === 'inflow' ? 'income.recorded' : 'expense.recorded',
        entityKind: 'transaction',
        entityId: rows[0].id,
        diff: { title, amountCents, currency, dateIso, flow }
      });
      return rows[0];
    })
  );

// --- ensure*Thread (object thread lazy creation) -------------------------

const buildEnsureThread = (entityKind, table) =>
  async ({ familyId, entityId }) =>
    withFamilyContext(familyId, (client) =>
      withTransaction(client, async () => {
        const { rows } = await client.query(
          `SELECT thread_id FROM ${table} WHERE id = $1 FOR UPDATE`,
          [entityId]
        );
        if (!rows.length) {
          const err = new Error(`${entityKind} not found`);
          err.status = 404;
          throw err;
        }
        if (rows[0].thread_id) return rows[0].thread_id;
        const { rows: thread } = await client.query(
          `INSERT INTO threads (family_id, kind, entity_kind, entity_id, e2e_encrypted)
           VALUES ($1, 'object', $2, $3, false)
           RETURNING id`,
          [familyId, entityKind, entityId]
        );
        const threadId = thread[0].id;
        await client.query(
          `UPDATE ${table} SET thread_id = $1 WHERE id = $2`,
          [threadId, entityId]
        );
        return threadId;
      })
    );

export const ensureBillThread = buildEnsureThread('bill', 'bills');
export const ensureBudgetThread = buildEnsureThread('budget', 'budgets');
export const ensureDebtThread = buildEnsureThread('debt', 'debts');
export const ensureSavingsGoalThread = buildEnsureThread('savings_goal', 'savings_goals');
export const ensureTransactionThread = buildEnsureThread('transaction', 'transactions');
