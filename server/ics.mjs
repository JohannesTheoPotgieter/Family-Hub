import { createHttpError, validateIcsSubscriptionUrl } from './security.mjs';
import { zonedDateTimeToIso } from '../src/domain/calendar.ts';

const FETCH_TIMEOUT_MS = 15_000;
const MAX_ICS_BYTES = 5 * 1024 * 1024;

const parseIcsValueLine = (line) => {
  const separatorIndex = line.indexOf(':');
  const left = separatorIndex >= 0 ? line.slice(0, separatorIndex) : line;
  const value = separatorIndex >= 0 ? line.slice(separatorIndex + 1) : '';
  const [name, ...params] = left.split(';');
  // Param values keep their case: TZID values are IANA zone ids.
  return { name: name.toUpperCase(), params: Object.fromEntries(params.map((part) => { const [key, rawValue = ''] = part.split('='); return [key.toUpperCase(), rawValue]; })), value };
};
const parseIcsDate = (value, params) => {
  const isAllDay = params.VALUE?.toUpperCase() === 'DATE' || /^\d{8}$/.test(value);
  if (isAllDay) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6));
    const day = Number(value.slice(6, 8));
    return { iso: new Date(year, month - 1, day, 12, 0, 0).toISOString(), allDay: true };
  }
  const raw = value.endsWith('Z') ? value.slice(0, -1) : value;
  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(4, 6));
  const day = Number(raw.slice(6, 8));
  const hour = Number(raw.slice(9, 11));
  const minute = Number(raw.slice(11, 13));
  const second = Number(raw.slice(13, 15) || '0');
  if (value.endsWith('Z')) {
    return { iso: new Date(Date.UTC(year, month - 1, day, hour, minute, second)).toISOString(), allDay: false };
  }
  if (params.TZID) {
    // TZID-anchored wall time — resolve in that zone, not the server's.
    const pad = (part) => String(part).padStart(2, '0');
    const wall = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}`;
    return { iso: zonedDateTimeToIso(wall, params.TZID), allDay: false };
  }
  return { iso: new Date(year, month - 1, day, hour, minute, second).toISOString(), allDay: false };
};

export const parseIcsEvents = (content, calendarId) => {
  const unfolded = content.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);
  const events = [];
  let current = null;
  // Depth of nested components (VALARM etc.) inside the current VEVENT —
  // an alarm's DESCRIPTION/SUMMARY must not clobber the parent event's.
  let nestedDepth = 0;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { current = {}; nestedDepth = 0; continue; }
    if (current && line.startsWith('BEGIN:')) { nestedDepth += 1; continue; }
    if (current && nestedDepth > 0 && line.startsWith('END:') && line !== 'END:VEVENT') { nestedDepth -= 1; continue; }
    if (current && nestedDepth > 0 && line !== 'END:VEVENT') continue;
    if (line === 'END:VEVENT') {
      if (current?.start) events.push({ id: current.uid ?? `${calendarId}-${events.length + 1}`, provider: 'ics', calendarId, title: current.summary ?? 'Untitled event', description: current.description, location: current.location, start: current.start, end: current.end ?? current.start, url: current.url, source: 'external' });
      current = null; nestedDepth = 0; continue;
    }
    if (!current || !line || line.startsWith('BEGIN:') || line.startsWith('END:')) continue;
    const parsed = parseIcsValueLine(line);
    if (parsed.name === 'SUMMARY') current.summary = parsed.value;
    if (parsed.name === 'DESCRIPTION') current.description = parsed.value.replace(/\\n/g, '\n');
    if (parsed.name === 'LOCATION') current.location = parsed.value;
    if (parsed.name === 'UID') current.uid = parsed.value;
    if (parsed.name === 'URL') current.url = parsed.value;
    if (parsed.name === 'DTSTART') current.start = parseIcsDate(parsed.value, parsed.params);
    if (parsed.name === 'DTEND') current.end = parseIcsDate(parsed.value, parsed.params);
  }
  return events;
};

export const createIcsService = () => {
  const cache = new Map();
  const fetchIcsEvents = async (subscription) => {
    const cached = cache.get(subscription.id);
    if (cached && Date.now() - cached.at < 10 * 60_000) return cached.events;
    // Re-validate on every fetch, not just at subscribe time: a hostname that
    // was public months ago can be re-pointed at a private address (DNS
    // rebinding). This narrows the window to a per-request TOCTOU rather
    // than a permanent bypass.
    await validateIcsSubscriptionUrl(subscription.url);
    const response = await fetch(subscription.url, {
      headers: { 'User-Agent': 'Family Hub Calendar Sync' },
      redirect: 'error',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    if (!response.ok) throw createHttpError(response.status, 'Could not download the ICS calendar.');
    // Stream with a byte cap so a huge (or endless) feed can't buffer the
    // process into an OOM.
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_ICS_BYTES) {
        await reader.cancel().catch(() => {});
        throw createHttpError(502, 'The ICS calendar is too large to import.');
      }
      chunks.push(value);
    }
    const text = Buffer.concat(chunks).toString('utf8');
    const events = parseIcsEvents(text, subscription.id);
    cache.set(subscription.id, { at: Date.now(), events });
    return events;
  };
  const clearSubscription = (subscriptionId) => cache.delete(subscriptionId);
  const clearAll = () => cache.clear();
  return { fetchIcsEvents, clearSubscription, clearAll };
};
