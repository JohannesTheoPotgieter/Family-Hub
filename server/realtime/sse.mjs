// SSE realtime hub (Phase 3.3 closeout).
//
// Hand-rolled Server-Sent Events on top of the existing http.mjs pattern.
// Connections are registered in-process; cross-instance fan-out goes via
// Redis pub/sub (reuses ioredis from BullMQ). Single-instance dev runs
// fine without Redis — broadcasts hit the in-process registry only.
//
// Why SSE instead of WebSocket:
//   - One-way (server → client) fits the chat fan-out shape exactly.
//   - Works with the existing fetch-based API client (no separate WS lib).
//   - Auto-reconnects with Last-Event-ID for free.
//   - Travels through CDNs / proxies that occasionally drop WS.
//
// Authentication: SSE GET cannot carry an Authorization header through
// EventSource, so /api/v2/realtime?ticket=... uses a short-lived signed
// ticket (see ticket.mjs). The ticket binds to (familyId, memberId, exp)
// and is single-use.

import { EventEmitter } from 'node:events';
import IORedis from 'ioredis';

const localBus = new EventEmitter();
localBus.setMaxListeners(0); // many concurrent SSE connections

let redisPub = null;
let redisSub = null;

const isRedisConfigured = () => Boolean(process.env.REDIS_URL);

const initRedis = () => {
  if (redisPub || !isRedisConfigured()) return;
  const url = process.env.REDIS_URL;
  redisPub = new IORedis(url, { maxRetriesPerRequest: null, enableReadyCheck: false });
  redisSub = new IORedis(url, { maxRetriesPerRequest: null, enableReadyCheck: false });
  redisSub.subscribe('family-hub:realtime').catch(() => {});
  redisSub.on('message', (_channel, raw) => {
    try {
      const event = JSON.parse(raw);
      // Re-emit on the local bus so listeners on this process receive it
      // without the originating server seeing duplicates of its own events.
      if (event && event.familyId && !event.__originPid) {
        localBus.emit(event.familyId, event);
      }
    } catch {
      // ignore malformed payload
    }
  });
};

initRedis();

/**
 * Broadcast a realtime event to every SSE connection scoped to `familyId`.
 *
 * Event shape:
 *   {
 *     type: 'message' | 'proposal' | 'attachment' | 'reaction' | 'audit',
 *     familyId, threadId?, ...payload
 *   }
 *
 * Always returns synchronously; Redis publish is fire-and-forget so a
 * write that needs to be acknowledged should NOT depend on push delivery.
 */
export const broadcast = (event) => {
  if (!event?.familyId) return;
  localBus.emit(event.familyId, event);
  if (redisPub) {
    redisPub
      .publish('family-hub:realtime', JSON.stringify({ ...event, __originPid: process.pid }))
      .catch(() => {});
  }
};

/**
 * Subscribe to events for a family. Returns an unsubscribe function.
 */
export const subscribe = (familyId, handler) => {
  localBus.on(familyId, handler);
  return () => {
    localBus.off(familyId, handler);
  };
};

/**
 * Open an SSE stream on a Node `res` and pump events for `familyId`.
 * Returns a `close()` callback that ends the stream cleanly.
 */
export const openSseStream = ({ req, res, clientOrigin, familyId, memberId, lastEventId }) => {
  const corsOrigin = clientOrigin ?? '*';
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Credentials': 'true'
  });
  // Initial comment to flush headers + retry hint.
  res.write(': stream open\n');
  res.write('retry: 5000\n\n');

  let eventId = lastEventId ? Number(lastEventId) : 0;
  const send = (event) => {
    eventId += 1;
    const payload = JSON.stringify(event);
    res.write(`id: ${eventId}\n`);
    res.write(`event: ${event.type ?? 'message'}\n`);
    res.write(`data: ${payload}\n\n`);
  };

  const heartbeat = setInterval(() => {
    res.write(`: hb ${Date.now()}\n\n`);
  }, 25_000).unref?.();

  const unsubscribe = subscribe(familyId, (event) => {
    // Filter: events explicitly addressed to a specific member only go to
    // that member; everything else fans out to all connections in the
    // family.
    if (event.targetMemberId && event.targetMemberId !== memberId) return;
    send(event);
  });

  const close = () => {
    if (heartbeat) clearInterval(heartbeat);
    unsubscribe();
    try {
      res.end();
    } catch {
      // already closed
    }
  };
  req.on('close', close);
  req.on('error', close);
  return close;
};

export const isRealtimeConfigured = () => true; // local bus is always available
