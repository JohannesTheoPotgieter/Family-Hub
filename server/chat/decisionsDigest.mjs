// Daily decisions digest (Phase 3.10).
//
// One BullMQ repeatable job per day at 7am SAST builds a summary of
// proposals applied / declined in the past 24h, plus reminders + chore
// completions, and pushes one notification + queues an email per
// parent_admin / adult_editor in each family. Kids don't get the digest.
//
// "Quiet but informed" — families that don't want chat noise can mute
// individual threads (Phase 3.10 settings) and still see this digest.

import { buildWorker, getQueue, isQueuesConfigured } from '../queues/index.mjs';
import { getPool, withFamilyContext } from '../db/pool.mjs';
import { listPushSubscriptionsForMember, deleteExpiredSubscription } from '../push/subscriptions.mjs';
import { sendPush } from '../push/webpush.mjs';
import { inboxCounts } from '../inbox/inbox.mjs';

const QUEUE = 'decisions-digest';
const EVENING_CRON = '0 5 * * *';   // 05:00 UTC = 07:00 SAST — yesterday's recap
const MORNING_CRON = '30 4 * * *';  // 04:30 UTC = 06:30 SAST — today's plan

export const ensureDigestSchedule = async () => {
  const queue = getQueue(QUEUE);
  if (!queue) return null;
  const existing = await queue.getRepeatableJobs();
  const ops = [];
  if (!existing.some((j) => j.name === 'sweep')) {
    ops.push(
      queue.add('sweep', {}, { repeat: { pattern: EVENING_CRON }, removeOnComplete: 50, removeOnFail: 100 })
    );
  }
  if (!existing.some((j) => j.name === 'morning')) {
    ops.push(
      queue.add(
        'morning',
        {},
        { repeat: { pattern: MORNING_CRON }, removeOnComplete: 50, removeOnFail: 100 }
      )
    );
  }
  return Promise.all(ops);
};

export const runDigestSweep = async ({ logger = console } = {}) => {
  const pool = getPool();
  const { rows: families } = await pool.query(`SELECT id FROM families`);
  let dispatched = 0;
  for (const { id: familyId } of families) {
    try {
      const summary = await buildFamilySummary(familyId);
      if (summary.totalEvents === 0) continue;
      dispatched += await deliverSummary({ familyId, summary });
    } catch (err) {
      logger.error?.(`[digest] family ${familyId}: ${err.message}`);
    }
  }
  return { dispatched };
};

/**
 * Morning brief — 06:30 SAST. One push per parent_admin/adult_editor
 * with today's view: how many decisions are pending, how many tasks are
 * due, how many bills hit this week. Pulls from the same Decision Inbox
 * the home-screen UI uses, so the push body is a strict subset of what
 * the user will see when they open the app.
 */
export const runMorningBrief = async ({ logger = console } = {}) => {
  const pool = getPool();
  const { rows: families } = await pool.query(`SELECT id FROM families`);
  let dispatched = 0;
  for (const { id: familyId } of families) {
    try {
      // Fetch every parent_admin / adult_editor in the family so each
      // gets their own personalised counts (a kid's todo doesn't surface
      // for mom unless it's overdue + shared).
      const { rows: members } = await pool.query(
        `SELECT id, role_key FROM family_members
          WHERE family_id = $1 AND status = 'active'
            AND role_key IN ('parent_admin', 'adult_editor')`,
        [familyId]
      );
      for (const member of members) {
        const counts = await inboxCounts({
          familyId,
          memberId: member.id,
          roleKey: member.role_key
        });
        if (counts.total === 0) continue;
        dispatched += await deliverMorning({ familyId, memberId: member.id, counts });
      }
    } catch (err) {
      logger.error?.(`[morning] family ${familyId}: ${err.message}`);
    }
  }
  return { dispatched };
};

const buildFamilySummary = async (familyId) =>
  withFamilyContext(familyId, async (client) => {
    // Last 24h window. We sum across audit_log so the digest reflects what
    // actually happened — proposal application, task completion, etc. —
    // not just chat activity.
    const { rows } = await client.query(
      `SELECT action, count(*)::int AS n
         FROM audit_log
        WHERE created_at >= now() - interval '24 hours'
          AND action IN (
            'proposal.applied', 'proposal.declined',
            'task.completed', 'event.created'
          )
        GROUP BY action`
    );
    const counts = Object.fromEntries(rows.map((r) => [r.action, r.n]));
    const totalEvents = rows.reduce((sum, r) => sum + r.n, 0);
    return {
      totalEvents,
      proposalsApplied: counts['proposal.applied'] ?? 0,
      proposalsDeclined: counts['proposal.declined'] ?? 0,
      tasksCompleted: counts['task.completed'] ?? 0,
      eventsAdded: counts['event.created'] ?? 0
    };
  });

const deliverSummary = async ({ familyId, summary }) => {
  const pool = getPool();
  const { rows: members } = await pool.query(
    `SELECT id, role_key FROM family_members
      WHERE family_id = $1 AND status = 'active'
        AND role_key IN ('parent_admin', 'adult_editor')`,
    [familyId]
  );
  const body = `Yesterday: ${summary.proposalsApplied} agreed, ${summary.tasksCompleted} chores done, ${summary.eventsAdded} new events.`;
  let delivered = 0;
  for (const member of members) {
    const subscriptions = await listPushSubscriptionsForMember({ familyId, memberId: member.id });
    for (const subscription of subscriptions) {
      const result = await sendPush({
        subscription,
        payload: {
          title: 'Family-Hub: yesterday',
          body,
          tag: `digest-${familyId}-${new Date().toISOString().slice(0, 10)}`,
          url: '/'
        }
      });
      if (result.ok) delivered += 1;
      if (result.reason === 'expired') {
        await deleteExpiredSubscription({ familyId, endpoint: subscription.endpoint });
      }
    }
  }
  return delivered;
};

export const startDecisionsDigestWorker = ({ logger = console } = {}) => {
  if (!isQueuesConfigured()) {
    logger.log?.('[digest] REDIS_URL not set; worker not started.');
    return null;
  }
  const worker = buildWorker(QUEUE, async (job) => {
    if (job.name === 'morning') return runMorningBrief({ logger });
    return runDigestSweep({ logger });
  });
  if (!worker) return null;
  worker.on('failed', (job, err) => {
    logger.error?.(`[digest] job ${job?.id} failed: ${err?.message}`);
  });
  return worker;
};

const deliverMorning = async ({ familyId, memberId, counts }) => {
  const subscriptions = await listPushSubscriptionsForMember({ familyId, memberId });
  if (!subscriptions.length) return 0;
  const parts = [];
  if (counts.proposals) parts.push(`${counts.proposals} ${counts.proposals === 1 ? 'decision' : 'decisions'} pending`);
  if (counts.tasks) parts.push(`${counts.tasks} ${counts.tasks === 1 ? 'chore' : 'chores'} due`);
  if (counts.bills) parts.push(`${counts.bills} ${counts.bills === 1 ? 'bill' : 'bills'} this week`);
  if (counts.conflicts) parts.push(`${counts.conflicts} ${counts.conflicts === 1 ? 'conflict' : 'conflicts'} on the calendar`);
  const body = parts.length ? parts.join(' · ') : 'You\'re all clear today.';
  let delivered = 0;
  for (const subscription of subscriptions) {
    const result = await sendPush({
      subscription,
      payload: {
        title: 'Good morning',
        body,
        tag: `morning-${familyId}-${memberId}-${new Date().toISOString().slice(0, 10)}`,
        url: '/?tab=Home'
      }
    });
    if (result.ok) delivered += 1;
    if (result.reason === 'expired') {
      await deleteExpiredSubscription({ familyId, endpoint: subscription.endpoint });
    }
  }
  return delivered;
};

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  ensureDigestSchedule().catch(() => {});
  const worker = startDecisionsDigestWorker();
  if (!worker) process.exit(0);
  process.on('SIGTERM', () => worker.close());
  process.on('SIGINT', () => worker.close());
}
