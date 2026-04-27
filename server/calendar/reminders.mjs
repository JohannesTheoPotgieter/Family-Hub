// Event reminder queue (Phase 1.8).
//
// Pattern: when an event is created or its start moves, schedule a delayed
// BullMQ job that fires `start - leadMinutes`. The worker pulls the
// member's push subscriptions and sends a notification via the shared
// web-push helper.
//
// We schedule one job per (event, member) so per-attendee opt-outs are
// trivial. `jobId` is deterministic so re-scheduling is idempotent.

import { buildWorker, getQueue, isQueuesConfigured } from '../queues/index.mjs';
import { listPushSubscriptionsForMember, deleteExpiredSubscription } from '../push/subscriptions.mjs';
import { sendPush } from '../push/webpush.mjs';

const QUEUE = 'reminders';

const reminderJobId = ({ eventId, memberId }) => `reminder-${eventId}-${memberId}`;

/**
 * Enqueue a reminder for the given attendee. Removes any prior job with the
 * same id so a moved event doesn't fire twice.
 *
 * @param {{
 *   familyId: string,
 *   memberId: string,
 *   eventId: string,
 *   title: string,
 *   startsAt: string,
 *   leadMinutes?: number
 * }} args
 */
export const scheduleEventReminder = async ({
  familyId,
  memberId,
  eventId,
  title,
  startsAt,
  leadMinutes = 30
}) => {
  const queue = getQueue(QUEUE);
  if (!queue) return null;

  const fireAt = Date.parse(startsAt) - leadMinutes * 60 * 1000;
  const delay = Math.max(0, fireAt - Date.now());
  if (fireAt < Date.now() - 60 * 1000) return null; // event already past

  const id = reminderJobId({ eventId, memberId });
  // BullMQ doesn't UPDATE delayed jobs in place; remove + re-add.
  try {
    await queue.remove(id);
  } catch {
    // noop — job didn't exist
  }
  return queue.add(
    'fire',
    { familyId, memberId, eventId, title, startsAt },
    { jobId: id, delay, removeOnComplete: 100, removeOnFail: 100 }
  );
};

export const cancelEventReminder = async ({ eventId, memberId }) => {
  const queue = getQueue(QUEUE);
  if (!queue) return false;
  try {
    return Boolean(await queue.remove(reminderJobId({ eventId, memberId })));
  } catch {
    return false;
  }
};

export const startReminderWorker = ({ logger = console } = {}) => {
  if (!isQueuesConfigured()) {
    logger.log?.('[reminders] REDIS_URL not set; reminder worker not started.');
    return null;
  }

  const worker = buildWorker(QUEUE, async (job) => {
    const { familyId, memberId, eventId, title, startsAt } = job.data;
    const subscriptions = await listPushSubscriptionsForMember({ familyId, memberId });
    if (!subscriptions.length) {
      logger.log?.(`[reminders] no push subs for ${memberId}; reminder dropped.`);
      return { delivered: 0 };
    }
    let delivered = 0;
    for (const subscription of subscriptions) {
      const result = await sendPush({
        subscription,
        payload: {
          title,
          body: `Starts at ${new Date(startsAt).toLocaleTimeString()}`,
          tag: `reminder-${eventId}`,
          url: `/calendar?event=${encodeURIComponent(eventId)}`
        }
      });
      if (result.ok) delivered += 1;
      if (result.reason === 'expired') {
        await deleteExpiredSubscription({ familyId, endpoint: subscription.endpoint });
      }
    }
    return { delivered };
  });
  if (!worker) return null;

  worker.on('failed', (job, err) => {
    logger.error?.(`[reminders] job ${job?.id} failed: ${err?.message}`);
  });
  return worker;
};

// `node server/calendar/reminders.mjs` to start the worker.
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const worker = startReminderWorker();
  if (!worker) process.exit(0);
  process.on('SIGTERM', () => worker.close());
  process.on('SIGINT', () => worker.close());
}
