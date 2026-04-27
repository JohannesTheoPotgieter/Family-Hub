export type Provider = 'google' | 'microsoft' | 'caldav' | 'ics';

export type NormalizedCalendar = {
  id: string;
  provider: Provider;
  name: string;
  primary?: boolean;
  color?: string;
  readOnly?: boolean;
  accountLabel?: string;
};

export type NormalizedEvent = {
  id: string;
  provider: Provider;
  calendarId: string;
  title: string;
  description?: string;
  location?: string;
  start: { iso: string; allDay: boolean };
  end: { iso: string; allDay: boolean };
  organizer?: string;
  url?: string;
  updatedAtIso?: string;
  source?: 'external' | 'internal';
};

export const toDedupeKey = (event: Pick<NormalizedEvent, 'provider' | 'calendarId' | 'id'>) =>
  `${event.provider}:${event.calendarId}:${event.id}`;

export const normalizeDateTime = (value: string | Date) => new Date(value).toISOString();

const localNoonFromDateOnly = (dateOnly: string) => {
  const [y, m, d] = dateOnly.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0).toISOString();
};

export const normalizeAllDayRange = (startDate: string, endDate?: string) => ({
  start: { iso: localNoonFromDateOnly(startDate), allDay: true },
  end: { iso: localNoonFromDateOnly(endDate ?? startDate), allDay: true }
});

export const normalizeGoogleEvent = (event: any, calendarId: string): NormalizedEvent => {
  const isAllDay = Boolean(event.start?.date);
  const allDay = isAllDay ? normalizeAllDayRange(event.start.date, event.end?.date) : undefined;

  return {
    id: event.id,
    provider: 'google',
    calendarId,
    title: event.summary ?? 'Untitled event',
    description: event.description,
    location: event.location,
    start: isAllDay ? allDay!.start : { iso: normalizeDateTime(event.start?.dateTime), allDay: false },
    end: isAllDay ? allDay!.end : { iso: normalizeDateTime(event.end?.dateTime ?? event.start?.dateTime), allDay: false },
    organizer: event.organizer?.email,
    url: event.htmlLink,
    updatedAtIso: event.updated,
    source: 'external'
  };
};

export const normalizeMicrosoftEvent = (event: any, calendarId: string): NormalizedEvent => {
  const isAllDay = Boolean(event.isAllDay);
  const startValue = event.start?.dateTime ?? event.start?.date;
  const endValue = event.end?.dateTime ?? event.end?.date ?? startValue;

  return {
    id: event.id,
    provider: 'microsoft',
    calendarId,
    title: event.subject ?? 'Untitled event',
    description: event.bodyPreview,
    location: event.location?.displayName,
    start: isAllDay ? normalizeAllDayRange(startValue.slice(0, 10)).start : { iso: normalizeDateTime(startValue), allDay: false },
    end: isAllDay ? normalizeAllDayRange(endValue.slice(0, 10)).end : { iso: normalizeDateTime(endValue), allDay: false },
    organizer: event.organizer?.emailAddress?.address,
    url: event.webLink,
    updatedAtIso: event.lastModifiedDateTime,
    source: 'external'
  };
};

// --- Serializers (Phase 1.3) -----------------------------------------------
//
// Inverse of the normalizers above. Used by the write-through path in
// server/calendar/eventStore.mjs: when the user creates / edits / deletes
// a Family-Hub event that's mirrored to a connected Google or Microsoft
// calendar, we serialize it and POST/PATCH the provider.
//
// We deliberately mirror only fields the normalizers preserve. Provider-
// specific extensions (Google's `colorId`, MS's `categories`) are out of
// scope for Phase 1.

const dateOnlyFromIso = (iso: string) => iso.slice(0, 10);

export type SerializedGoogleEvent = {
  id?: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime: string } | { date: string };
  end: { dateTime: string } | { date: string };
  // Used by serialize-for-update so we can pin against the etag we last saw.
  // Caller sends as `If-Match` header.
  etag?: string;
};

export const serializeGoogleEvent = (event: NormalizedEvent): SerializedGoogleEvent => {
  const allDay = Boolean(event.start.allDay && event.end.allDay);
  return {
    id: event.id,
    summary: event.title,
    description: event.description,
    location: event.location,
    start: allDay ? { date: dateOnlyFromIso(event.start.iso) } : { dateTime: event.start.iso },
    end: allDay ? { date: dateOnlyFromIso(event.end.iso) } : { dateTime: event.end.iso }
  };
};

export type SerializedMicrosoftEvent = {
  id?: string;
  subject: string;
  body?: { contentType: 'text' | 'html'; content: string };
  location?: { displayName: string };
  isAllDay: boolean;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
};

export const serializeMicrosoftEvent = (event: NormalizedEvent): SerializedMicrosoftEvent => {
  const allDay = Boolean(event.start.allDay && event.end.allDay);
  // Graph requires a timeZone string for non-all-day; ISO-Z input is "UTC".
  const tz = 'UTC';
  return {
    id: event.id,
    subject: event.title,
    body: event.description ? { contentType: 'text', content: event.description } : undefined,
    location: event.location ? { displayName: event.location } : undefined,
    isAllDay: allDay,
    start: { dateTime: allDay ? dateOnlyFromIso(event.start.iso) : event.start.iso, timeZone: tz },
    end: { dateTime: allDay ? dateOnlyFromIso(event.end.iso) : event.end.iso, timeZone: tz }
  };
};

// --- Conflict detection (Phase 1.7) ----------------------------------------
//
// `findConflicts` returns pairs of events that overlap in time. Used by the
// family overlay so two-parent households see "Sara has soccer at the same
// time you have a meeting" without having to mentally diff calendars.
//
// O(n log n): sort by start, sweep with a min-heap-equivalent of currently
// open events. We just walk the sorted list since pair density is low (one
// family's calendar, not a stadium).

export type EventLike = {
  id: string;
  title?: string;
  start: { iso: string };
  end: { iso: string };
  attendeeIds?: string[];
};

export type ConflictPair = {
  a: EventLike;
  b: EventLike;
  /** When both events share at least one attendee. The strong signal — same
   *  person can't be in two places. */
  sharedAttendeeIds: string[];
};

const overlap = (a: EventLike, b: EventLike) =>
  Date.parse(a.start.iso) < Date.parse(b.end.iso) &&
  Date.parse(b.start.iso) < Date.parse(a.end.iso);

export const findConflicts = (events: EventLike[]): ConflictPair[] => {
  const sorted = [...events].sort(
    (a, b) => Date.parse(a.start.iso) - Date.parse(b.start.iso)
  );
  const out: ConflictPair[] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      if (Date.parse(b.start.iso) >= Date.parse(a.end.iso)) break; // sorted: no further j can overlap a
      if (!overlap(a, b)) continue;
      const aAttendees = new Set(a.attendeeIds ?? []);
      const sharedAttendeeIds = (b.attendeeIds ?? []).filter((id) => aAttendees.has(id));
      out.push({ a, b, sharedAttendeeIds });
    }
  }
  return out;
};
