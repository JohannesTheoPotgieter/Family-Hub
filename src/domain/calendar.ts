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

const hasExplicitOffset = (value: string) => /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value.trim());

// Minutes the given IANA zone is ahead of UTC at `date`.
const zoneOffsetMs = (date: Date, timeZone: string) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    }).formatToParts(date).map((part) => [part.type, part.value])
  );
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second)
  );
  return asUtc - date.getTime();
};

// Graph (and CalDAV TZID values) send wall-clock datetimes with the zone in
// a separate field. `new Date(value)` would read them in the VIEWER's local
// zone, shifting every event by the viewer's UTC offset. Resolve the wall
// time against the stated zone instead; unknown zones fall back to UTC —
// Graph's default response zone — rather than the viewer's.
export const zonedDateTimeToIso = (value: string | Date, timeZone?: string) => {
  if (value instanceof Date) return value.toISOString();
  if (!timeZone || hasExplicitOffset(value)) return new Date(value).toISOString();
  const wallAsUtc = new Date(`${value}Z`);
  if (Number.isNaN(wallAsUtc.getTime())) return new Date(value).toISOString();
  if (timeZone === 'UTC') return wallAsUtc.toISOString();
  try {
    // Two passes so a DST transition between the guess and the real instant
    // resolves to the correct offset.
    const first = new Date(wallAsUtc.getTime() - zoneOffsetMs(wallAsUtc, timeZone));
    return new Date(wallAsUtc.getTime() - zoneOffsetMs(first, timeZone)).toISOString();
  } catch {
    return wallAsUtc.toISOString();
  }
};

const localNoonFromDateOnly = (dateOnly: string) => {
  const [y, m, d] = dateOnly.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0).toISOString();
};

const previousDay = (dateOnly: string) => {
  const [y, m, d] = dateOnly.split('-').map(Number);
  const date = new Date(y, (m ?? 1) - 1, (d ?? 1) - 1);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const normalizeAllDayRange = (startDate: string, endDate?: string, endExclusive = false) => {
  // Google and Microsoft report all-day ends EXCLUSIVE (a one-day event on
  // the 16th ends on the 17th); rendering that verbatim spans an extra day.
  let effectiveEnd = endDate ?? startDate;
  if (endExclusive && endDate) {
    const inclusive = previousDay(endDate);
    effectiveEnd = inclusive >= startDate ? inclusive : startDate;
  }
  return {
    start: { iso: localNoonFromDateOnly(startDate), allDay: true },
    end: { iso: localNoonFromDateOnly(effectiveEnd), allDay: true }
  };
};

export const normalizeGoogleEvent = (event: any, calendarId: string): NormalizedEvent => {
  const isAllDay = Boolean(event.start?.date);
  const allDay = isAllDay ? normalizeAllDayRange(event.start.date, event.end?.date, true) : undefined;

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
  const allDay = isAllDay
    ? normalizeAllDayRange(startValue.slice(0, 10), endValue?.slice(0, 10), true)
    : undefined;

  return {
    id: event.id,
    provider: 'microsoft',
    calendarId,
    title: event.subject ?? 'Untitled event',
    description: event.bodyPreview,
    location: event.location?.displayName,
    // Graph sends offset-less wall times zoned by the separate timeZone
    // field (UTC unless a Prefer header asks otherwise).
    start: isAllDay ? allDay!.start : { iso: zonedDateTimeToIso(startValue, event.start?.timeZone ?? 'UTC'), allDay: false },
    end: isAllDay ? allDay!.end : { iso: zonedDateTimeToIso(endValue, event.end?.timeZone ?? 'UTC'), allDay: false },
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

// Normalized all-day ends are INCLUSIVE; Google/Microsoft expect them
// exclusive, so writes must push the end forward a day again.
const nextDayFromIso = (iso: string) => {
  const [y, m, d] = dateOnlyFromIso(iso).split('-').map(Number);
  const date = new Date(y, (m ?? 1) - 1, (d ?? 1) + 1);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

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
    end: allDay ? { date: nextDayFromIso(event.end.iso) } : { dateTime: event.end.iso }
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
    end: { dateTime: allDay ? nextDayFromIso(event.end.iso) : event.end.iso, timeZone: tz }
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
