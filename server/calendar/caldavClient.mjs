// CalDAV client wrapper (Phase 1 closeout — Apple / iCloud support).
//
// iCloud requires app-specific passwords; the connection's `tokens` blob
// stores `{ username, appPassword, serverUrl }` post-OAuth-style flow
// implemented in a Phase 5 connection wizard. For now this module exposes
// the read/write primitives the rest of the calendar layer can already
// drive; once the wizard ships, the existing connectionStore +
// mirrorOutbound + syncWorker plug in unchanged.
//
// We use tsdav (DAV client + iCloud preset) for the protocol details, plus
// ICAL.js for parsing/serializing iCalendar bodies.
//
// Wire shape kept aligned with the Google + Microsoft clients so
// mirrorOutbound can call upsertCalDavEvent / deleteCalDavEvent the same
// way it calls the others.

import {
  createDAVClient,
  createCalendarObject,
  updateCalendarObject,
  deleteCalendarObject,
  fetchCalendarObjects
} from 'tsdav';
import ICAL from 'ical.js';

const ICLOUD_SERVER = 'https://caldav.icloud.com';

const buildClient = async (tokens) => {
  const serverUrl = tokens.serverUrl ?? ICLOUD_SERVER;
  return createDAVClient({
    serverUrl,
    credentials: {
      username: tokens.username,
      password: tokens.appPassword
    },
    authMethod: 'Basic',
    defaultAccountType: 'caldav'
  });
};

// --- iCalendar serialization ---------------------------------------------

const toIcsDate = (iso) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');

const formatRecurrence = (rruleText) => {
  if (!rruleText) return '';
  const cleaned = rruleText
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => (line.startsWith('RRULE:') ? line : `RRULE:${line.replace(/^RRULE:/, '')}`))
    .join('\r\n');
  return cleaned ? `\r\n${cleaned}` : '';
};

const eventToIcs = (event, uid) => {
  const dtstart = event.start.allDay ? `DTSTART;VALUE=DATE:${event.start.iso.slice(0, 10).replace(/-/g, '')}` : `DTSTART:${toIcsDate(event.start.iso)}`;
  const dtend = event.end.allDay ? `DTEND;VALUE=DATE:${event.end.iso.slice(0, 10).replace(/-/g, '')}` : `DTEND:${toIcsDate(event.end.iso)}`;
  const summary = `SUMMARY:${(event.title ?? '').replace(/[\r\n]+/g, ' ')}`;
  const description = event.description ? `\r\nDESCRIPTION:${event.description.replace(/[\r\n]+/g, '\\n')}` : '';
  const location = event.location ? `\r\nLOCATION:${event.location.replace(/[\r\n]+/g, ' ')}` : '';
  const recurrence = formatRecurrence(event.rruleText);
  const stamp = toIcsDate(new Date().toISOString());

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Family-Hub//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    dtstart,
    dtend,
    summary + description + location + recurrence,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
};

const parseIcsEvent = (ics) => {
  const jcal = ICAL.parse(ics);
  const comp = new ICAL.Component(jcal);
  const vevent = comp.getFirstSubcomponent('vevent');
  if (!vevent) return null;
  const event = new ICAL.Event(vevent);
  return {
    id: event.uid,
    title: event.summary ?? 'Untitled event',
    description: event.description,
    location: event.location,
    start: { iso: event.startDate?.toJSDate().toISOString(), allDay: event.startDate?.isDate ?? false },
    end: { iso: event.endDate?.toJSDate().toISOString(), allDay: event.endDate?.isDate ?? false },
    rruleText: vevent
      .getAllProperties('rrule')
      .map((p) => `RRULE:${p.toICALString().replace(/^RRULE[:;]/i, '')}`)
      .join('\n') || null
  };
};

// --- Public API ----------------------------------------------------------

/**
 * @param {{
 *   tokens: { username: string, appPassword: string, serverUrl?: string },
 *   calendarUrl: string,
 *   event: import('../../src/domain/calendar.ts').NormalizedEvent,
 *   etag?: string | null
 * }} args
 */
export const upsertCalDavEvent = async ({ tokens, calendarUrl, event, etag }) => {
  const client = await buildClient(tokens);
  const uid = event.id || `${Date.now()}@family-hub`;
  const ics = eventToIcs(event, uid);
  const filename = `${uid}.ics`;
  const calendar = { url: calendarUrl };

  if (event.id && etag) {
    const result = await updateCalendarObject({
      calendarObject: { url: `${calendarUrl}${filename}`, etag, data: ics }
    });
    return { remoteId: uid, etag: result.headers?.etag ?? null };
  }
  const result = await createCalendarObject({
    calendar,
    filename,
    iCalString: ics
  });
  return { remoteId: uid, etag: result.headers?.etag ?? null };
};

/**
 * @param {{ tokens: object, calendarUrl: string, eventId: string, etag?: string | null }} args
 */
export const deleteCalDavEvent = async ({ tokens, calendarUrl, eventId, etag }) => {
  await buildClient(tokens); // refreshes auth (no-op for Basic but keeps API parity)
  await deleteCalendarObject({
    calendarObject: { url: `${calendarUrl}${eventId}.ics`, etag, data: '' }
  });
  return { ok: true };
};

/**
 * Fetch every object on a calendar — used for the initial scan + as the
 * fallback "delta" since CalDAV doesn't have a sync-token primitive across
 * all servers. iCloud's WebDAV-Sync support is patchy enough that the
 * worker just re-scans every poll cycle and lets upsertExternalEvent
 * handle dedupe.
 *
 * @param {{ tokens: object, calendarUrl: string }} args
 */
export const listCalDavEvents = async ({ tokens, calendarUrl }) => {
  await buildClient(tokens);
  const objects = await fetchCalendarObjects({ calendar: { url: calendarUrl } });
  return objects
    .map((obj) => {
      const parsed = parseIcsEvent(obj.data);
      if (!parsed) return null;
      return { ...parsed, etag: obj.etag ?? null };
    })
    .filter((event) => Boolean(event));
};
