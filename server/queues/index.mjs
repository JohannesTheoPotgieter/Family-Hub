// BullMQ queue + worker bootstrap (Phase 1.5 + 1.8).
//
// Single Redis connection (Upstash recommended) shared by every queue. Two
// queues at this point:
//   calendar-sync     — polls Microsoft, processes Google push channels,
//                        reconciles diffs against internal_events.
//   reminders         — delayed jobs that fire web push N minutes before
//                        an event start.
//
// Fail-soft: if REDIS_URL isn't set, getQueue() / getWorker() return null
// and callers either skip or log. The dev server still boots without Redis.

import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

let connection = null;
const queues = new Map();

export const isQueuesConfigured = () => Boolean(process.env.REDIS_URL);

const getConnection = () => {
  if (connection) return connection;
  if (!isQueuesConfigured()) return null;
  // BullMQ requires `maxRetriesPerRequest: null` for blocking ops.
  connection = new IORedis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  });
  return connection;
};

export const getQueue = (name) => {
  if (!isQueuesConfigured()) return null;
  if (queues.has(name)) return queues.get(name);
  const conn = getConnection();
  if (!conn) return null;
  const queue = new Queue(name, { connection: conn });
  queues.set(name, queue);
  return queue;
};

/**
 * Build a worker for the given queue. Returns null when Redis isn't
 * configured. Caller is responsible for `worker.run()` / disposal in a
 * long-running process; in serverless, prefer enqueueing only.
 *
 * @param {string} name
 * @param {(job: import('bullmq').Job) => Promise<unknown>} processor
 * @param {object} [options]
 */
export const buildWorker = (name, processor, options = {}) => {
  const conn = getConnection();
  if (!conn) return null;
  return new Worker(name, processor, { connection: conn, ...options });
};

export const closeQueues = async () => {
  for (const queue of queues.values()) {
    try {
      await queue.close();
    } catch {
      // ignore
    }
  }
  queues.clear();
  if (connection) {
    try {
      await connection.quit();
    } catch {
      // ignore
    }
    connection = null;
  }
};
