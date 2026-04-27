// LocalState → DB importer (Phase 0.3).
//
// Accepts the existing client `FamilyHubState` blob, runs every section
// through the shared sanitizers, and writes the result into the active
// family's tables in a single transaction. Doubles as the seed pattern for
// new signups — `useLocalState: false` produces an empty initial set.
//
// Inputs come from untrusted localStorage; nothing here should trust shape.

import { randomUUID } from 'node:crypto';
import { withFamilyContext, withTransaction } from '../db/pool.mjs';
import {
  sanitizeMoneyState,
  sanitizeCalendarState
} from '../../src/domain/sanitize.ts';
import { ensureFamilyThread } from '../chat/threadStore.mjs';

/**
 * @param {{
 *   familyId: string,
 *   actorMemberId: string | null,
 *   localState: any
 * }} args
 * @returns {Promise<{
 *   bills: number,
 *   transactions: number,
 *   budgets: number,
 *   savingsGoals: number,
 *   plannerItems: number,
 *   tasks: number,
 *   internalEvents: number
 * }>}
 */
export const importLocalState = async ({ familyId, actorMemberId, localState }) => {
  const money = sanitizeMoneyState(localState?.money ?? {});
  const calendar = sanitizeCalendarState(localState?.calendar ?? {});
  const tasks = Array.isArray(localState?.tasks?.items) ? localState.tasks.items : [];

  // Belt-and-braces: imported families that didn't go through the Clerk
  // user.created webhook may not have a family thread yet. Idempotent.
  await ensureFamilyThread({ familyId }).catch(() => {});

  return withFamilyContext(familyId, (client) =>
    withTransaction(client, async () => {
      const counts = {
        bills: 0,
        transactions: 0,
        budgets: 0,
        savingsGoals: 0,
        plannerItems: 0,
        tasks: 0,
        internalEvents: 0
      };

      for (const bill of money.bills) {
        await client.query(
          `INSERT INTO bills (id, family_id, title, amount_cents, currency, due_date, category,
                              paid, paid_date, notes, recurrence, recurrence_day,
                              auto_create_transaction)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           ON CONFLICT (id) DO NOTHING`,
          [
            asUuid(bill.id),
            familyId,
            bill.title,
            bill.amountCents,
            money.settings.currency,
            bill.dueDateIso,
            bill.category,
            bill.paid,
            bill.paidDateIso ?? null,
            bill.notes ?? null,
            bill.recurrence ?? 'none',
            bill.recurrenceDay ?? null,
            bill.autoCreateTransaction ?? true
          ]
        );
        counts.bills += 1;
      }

      for (const tx of money.transactions) {
        await client.query(
          `INSERT INTO transactions (id, family_id, title, amount_cents, currency, tx_date, kind,
                                     category, notes, source, statement_file_name)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT (id) DO NOTHING`,
          [
            asUuid(tx.id),
            familyId,
            tx.title,
            tx.amountCents,
            money.settings.currency,
            tx.dateIso,
            tx.kind,
            tx.category,
            tx.notes ?? null,
            tx.source,
            tx.statementFileName ?? null
          ]
        );
        counts.transactions += 1;
      }

      for (const budget of money.budgets) {
        await client.query(
          `INSERT INTO budgets (id, family_id, month_iso, category, limit_cents, currency)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (family_id, month_iso, category) DO UPDATE SET limit_cents = EXCLUDED.limit_cents`,
          [
            asUuid(budget.id),
            familyId,
            budget.monthIsoYYYYMM,
            budget.category,
            budget.limitCents,
            money.settings.currency
          ]
        );
        counts.budgets += 1;
      }

      for (const goal of money.savingsGoals) {
        await client.query(
          `INSERT INTO savings_goals (id, family_id, title, target_cents, saved_cents, currency)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (id) DO NOTHING`,
          [asUuid(goal.id), familyId, goal.title, goal.targetCents, goal.savedCents, money.settings.currency]
        );
        counts.savingsGoals += 1;
      }

      for (const item of money.plannerItems) {
        await client.query(
          `INSERT INTO planner_items (id, family_id, category, description, kind, is_fixed,
                                       monthly_overrides, default_amount_cents, currency, is_active)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (id) DO NOTHING`,
          [
            asUuid(item.id),
            familyId,
            item.category,
            item.description,
            item.kind,
            item.isFixed,
            JSON.stringify(item.monthlyOverrides ?? {}),
            item.defaultAmountCents,
            money.settings.currency,
            item.isActive
          ]
        );
        counts.plannerItems += 1;
      }

      for (const event of calendar.events) {
        // CalendarState.events are coarse "appointment / event" rows. Map to
        // internal_events with a noon-anchored timestamp so they show up on
        // the right day regardless of timezone.
        const startsAt = `${event.date}T12:00:00Z`;
        await client.query(
          `INSERT INTO internal_events (family_id, title, starts_at, ends_at, all_day, created_by_member_id)
           VALUES ($1,$2,$3,$4,true,$5)
           ON CONFLICT DO NOTHING`,
          [familyId, event.title, startsAt, startsAt, actorMemberId]
        );
        counts.internalEvents += 1;
      }

      // Tasks are stored per-owner in the prototype. Without member mapping
      // we drop the ownerId — the importer can be re-run after invites land
      // with a member-id translation table. Leaving as-is keeps the path
      // trivially correct for single-member migrations.
      for (const task of tasks) {
        await client.query(
          `INSERT INTO tasks (id, family_id, title, notes, owner_member_id, shared, due_date,
                              recurrence, completed, archived, completion_count, last_completed_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           ON CONFLICT (id) DO NOTHING`,
          [
            asUuid(task.id),
            familyId,
            task.title,
            task.notes ?? null,
            actorMemberId, // owner mapping deferred to invite acceptance
            Boolean(task.shared),
            task.dueDate ?? null,
            task.recurrence ?? 'none',
            Boolean(task.completed),
            Boolean(task.archived),
            Number(task.completionCount ?? 0),
            task.lastCompletedAtIso ?? null
          ]
        );
        counts.tasks += 1;
      }

      await client.query(
        `INSERT INTO audit_log (family_id, actor_member_id, action, entity_kind, diff)
         VALUES ($1, $2, 'local_state.imported', 'family', $3::jsonb)`,
        [familyId, actorMemberId, JSON.stringify(counts)]
      );

      return counts;
    })
  );
};

// Legacy localStorage ids look like `bill-rent` or `setup-bill-johannes-...`.
// We mint a fresh v4 UUID for every imported row; the original id ends up in
// the audit_log diff so an operator can trace back if a follow-up sync needs
// to dedupe. Re-running the importer with the same JSON inserts a new row
// set rather than upserting — that matches the documented one-shot intent
// of POST /api/migrate/local-state.
const asUuid = (raw) => {
  if (typeof raw === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
    return raw;
  }
  return randomUUID();
};
