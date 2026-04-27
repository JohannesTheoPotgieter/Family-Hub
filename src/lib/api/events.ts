// Typed events + proposals + conflicts client (Phase 5 calendar cutover).
//
// Wraps every read/write the new CalendarServerView calls. Stays
// schema-aligned with the server's eventStore: starts/ends are full
// ISO timestamps; allDay flag flips both ends to the noon-anchored
// shape from sanitize.ts.

import { apiGet, apiSend } from './client.ts';
import type { InboxConflict } from './inbox.ts';

export type EventRow = {
  id: string;
  familyId: string;
  title: string;
  description?: string;
  location?: string;
  start: { iso: string; allDay: boolean };
  end: { iso: string; allDay: boolean };
  rruleText: string | null;
  recurrenceParentId: string | null;
  etag: string | null;
  threadId: string | null;
  attendeeIds: string[];
};

export type EventInput = {
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: string;
  endsAt: string;
  allDay?: boolean;
  rruleText?: string | null;
  attendeeMemberIds?: string[];
  calendarConnectionId?: string | null;
};

export const fetchEvents = (fromIso: string, toIso: string) =>
  apiGet<{ events: EventRow[] }>(
    `/api/v2/events?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`
  );

export const createEvent = (event: EventInput) =>
  apiSend<{ event: EventRow }>('/api/v2/events', 'POST', event);

export const updateEvent = (eventId: string, patch: Partial<EventInput> & { expectedEtag?: string }) =>
  apiSend<{ event: EventRow }>(`/api/v2/events/${encodeURIComponent(eventId)}`, 'PATCH', patch);

export const deleteEvent = (eventId: string) =>
  apiSend<{ ok: true }>(`/api/v2/events/${encodeURIComponent(eventId)}`, 'DELETE');

export const fetchConflicts = (fromIso: string, toIso: string) =>
  apiGet<{ conflicts: InboxConflict[] }>(
    `/api/v2/conflicts?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`
  );

export type ProposeChangeBody = {
  change: Record<string, unknown>;
  entityId: string;
  threadId?: string;
};

export const proposeChange = (body: ProposeChangeBody) =>
  apiSend<{ proposal: { id: string; status: string }; messageId: string }>(
    '/api/proposals',
    'POST',
    body
  );
