// Task reminder queue (Phase 2.3).
//
// Mirrors server/calendar/reminders.mjs. Tasks have date-only `due_date`
// fields; we fire at the user's configured "morning" hour on the due day
// (defaults to 09:00 in the family's timezone — Africa/Johannesburg by
// default, configurable later via family.locale settings).
//
// Idempotent: deterministic jobIds per (taskId, memberId) so re-scheduling
// the same task removes any prior delayed job.

import { buildWorker, getQueue, isQueuesConfigured } from '../queues/index.mjs';
import {
  deleteExpiredSubscription,
  listPushSubscriptionsForMember
} from '../push/subscriptions.mjs';
import { sendPush } from '../push/webpush.mjs';

const QUEUE = 'task-reminders';
const DEFAULT_FIRE_HOUR_UTC = 7; // 09:00 SAST

const reminderJobId = ({ taskId, memberId }) => `task-${taskId}-${memberId}`;

const fireTimeFor = (dueDate) => {
  // dueDate is YYYY-MM-DD; pin to DEFAULT_FIRE_HOUR_UTC on that day.
  const at = new Date(`${dueDate}T${String(DEFAULT_FIRE_HOUR_UTC).padStart(2, '0')}:00:00Z`);
  return at.getTime();
};

/**
 * @param {{
 *   familyId: string,
 *   memberId: string,
 *   taskId: string,
 *   title: string,
 *   dueDate: string
 * }} args
 */
export const scheduleTaskReminder = async ({ familyId, memberId, taskId, title, dueDate }) => {
  const queue = getQueue(QUEUE);
  if (!queue) return null;
  if (!dueDate) return null;

  const fireAt = fireTimeFor(dueDate);
  const delay = Math.max(0, fireAt - Date.now());
  if (fireAt < Date.now() - 24 * 60 * 60 * 1000) return null; // due > 24h ago

  const id = reminderJobId({ taskId, memberId });
  try {
    await queue.remove(id);
  } catch {
    // noop
  }
  return queue.add(
    'fire',
    { familyId, memberId, taskId, title, dueDate },
    { jobId: id, delay, removeOnComplete: 100, removeOnFail: 100 }
  );
};

export const cancelTaskReminder = async ({ taskId, memberId }) => {
  const queue = getQueue(QUEUE);
  if (!queue) return false;
  try {
    return Boolean(await queue.remove(reminderJobId({ taskId, memberId })));
  } catch {
    return false;
  }
};

export const startTaskReminderWorker = ({ logger = console } = {}) => {
  if (!isQueuesConfigured()) {
    logger.log?.('[task-reminders] REDIS_URL not set; worker not started.');
    return null;
  }
  const worker = buildWorker(QUEUE, async (job) => {
    const { familyId, memberId, taskId, title, dueDate } = job.data;
    const subscriptions = await listPushSubscriptionsForMember({ familyId, memberId });
    if (!subscriptions.length) return { delivered: 0 };
    let delivered = 0;
    for (const subscription of subscriptions) {
      const result = await sendPush({
        subscription,
        payload: {
          title: 'Task due today',
          body: title,
          tag: `task-${taskId}`,
          url: `/tasks?task=${encodeURIComponent(taskId)}`
        }
      });
      if (result.ok) delivered += 1;
      if (result.reason === 'expired') {
        await deleteExpiredSubscription({ familyId, endpoint: subscription.endpoint });
      }
    }
    return { delivered, dueDate };
  });
  if (!worker) return null;
  worker.on('failed', (job, err) => {
    logger.error?.(`[task-reminders] job ${job?.id} failed: ${err?.message}`);
  });
  return worker;
};

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const worker = startTaskReminderWorker();
  if (!worker) process.exit(0);
  process.on('SIGTERM', () => worker.close());
  process.on('SIGINT', () => worker.close());
}
