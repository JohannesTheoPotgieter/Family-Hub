// Client realtime consumer (Phase 3.3 client side).
//
// Open an SSE stream to /api/v2/realtime authenticated by a single-use
// ticket minted via POST /api/v2/realtime/ticket. EventSource handles
// reconnect with Last-Event-ID for free; on auth-rotation (401/403 from
// stream open) we mint a fresh ticket and retry.
//
// Public API: connectRealtime(handler) returns a `disconnect()` function
// the caller invokes on cleanup. handler is called with the raw event
// object the server broadcasts:
//   { type: 'message' | 'proposal.created' | 'proposal.applied' | ...,
//     familyId, threadId?, ...payload }
//
// Filtering is done downstream (the client only subscribes to events for
// its own family — that's enforced by the ticket's familyId).

import { apiSend } from '../api/client.ts';

export type RealtimeEvent =
  | { type: 'message'; familyId: string; threadId: string; message: unknown }
  | { type: 'proposal.created'; familyId: string; threadId: string; proposal: unknown; messageId: string }
  | { type: 'proposal.applied'; familyId: string; threadId: string; proposalId: string; diff: unknown }
  | { type: string; familyId: string; threadId?: string; [key: string]: unknown };

export type RealtimeHandler = (event: RealtimeEvent) => void;

const mintTicket = async (): Promise<string> => {
  const response = await apiSend<{ ticket: string }>('/api/v2/realtime/ticket', 'POST');
  return response.ticket;
};

const buildStreamUrl = (ticket: string) => {
  // EventSource follows the same-origin rule unless `withCredentials` is
  // explicitly set. We pass the ticket in the query string because
  // EventSource doesn't allow custom headers.
  const params = new URLSearchParams({ ticket });
  return `/api/v2/realtime?${params.toString()}`;
};

export const connectRealtime = (handler: RealtimeHandler) => {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    return () => {};
  }

  let source: EventSource | null = null;
  let closed = false;
  let backoffMs = 1000;
  const maxBackoffMs = 30_000;

  const open = async () => {
    if (closed) return;
    let ticket: string;
    try {
      ticket = await mintTicket();
    } catch {
      // Auth not ready yet — try again in a bit.
      setTimeout(open, backoffMs);
      backoffMs = Math.min(backoffMs * 2, maxBackoffMs);
      return;
    }

    source = new EventSource(buildStreamUrl(ticket), { withCredentials: true });
    source.onopen = () => {
      backoffMs = 1000; // reset backoff on successful open
    };
    source.onmessage = (e) => {
      try {
        handler(JSON.parse(e.data));
      } catch {
        // ignore malformed payload
      }
    };
    // Server sends `event: <type>` per broadcast. Native EventSource only
    // delivers default-named events to onmessage; named events need
    // explicit listeners. We register a few we care about plus the
    // default channel.
    for (const eventName of ['message', 'proposal.created', 'proposal.applied', 'attachment', 'reaction', 'audit']) {
      source.addEventListener(eventName, (e) => {
        try {
          handler(JSON.parse((e as MessageEvent).data));
        } catch {
          // ignore
        }
      });
    }
    source.onerror = () => {
      // EventSource auto-reconnects, but if the server returned a 4xx
      // ticket-expired status the close is permanent — re-mint a ticket.
      if (source?.readyState === EventSource.CLOSED) {
        source = null;
        if (!closed) {
          setTimeout(open, backoffMs);
          backoffMs = Math.min(backoffMs * 2, maxBackoffMs);
        }
      }
    };
  };

  open();

  return () => {
    closed = true;
    if (source) {
      source.close();
      source = null;
    }
  };
};
