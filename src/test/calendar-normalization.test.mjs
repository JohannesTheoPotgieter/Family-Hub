// Regression tests for provider datetime normalization. Pinned to the
// app's home timezone (UTC+2) so viewer-local parsing bugs surface:
// Graph returns offset-less wall times zoned by a separate field, and
// ICS feeds anchor wall times with TZID params — neither may be read in
// the viewer's local zone. Each test file gets its own process, so the
// TZ override does not leak.
process.env.TZ = 'Africa/Johannesburg';

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeGoogleEvent,
  normalizeMicrosoftEvent,
  serializeGoogleEvent,
  zonedDateTimeToIso
} from '../domain/calendar.ts';
import { parseIcsText } from '../integrations/calendar/icsParser.ts';

test('zonedDateTimeToIso resolves offset-less wall times against the stated zone', () => {
  // 08:00 UTC is 08:00Z — the old new Date() parse read it as 08:00 SAST (06:00Z).
  assert.equal(zonedDateTimeToIso('2026-07-16T08:00:00.0000000', 'UTC'), '2026-07-16T08:00:00.000Z');
  // 08:00 London summer time (BST, UTC+1) is 07:00Z.
  assert.equal(zonedDateTimeToIso('2026-07-16T08:00:00', 'Europe/London'), '2026-07-16T07:00:00.000Z');
  // Explicit offsets win over the zone hint.
  assert.equal(zonedDateTimeToIso('2026-07-16T08:00:00+02:00', 'UTC'), '2026-07-16T06:00:00.000Z');
  // Unknown zones fall back to UTC — deterministic, not viewer-local.
  assert.equal(zonedDateTimeToIso('2026-07-16T08:00:00', 'Not/AZone'), '2026-07-16T08:00:00.000Z');
});

test('normalizeMicrosoftEvent keeps Graph UTC times as UTC instants', () => {
  const event = normalizeMicrosoftEvent(
    {
      id: 'ms-1',
      subject: 'Standup',
      isAllDay: false,
      start: { dateTime: '2026-07-16T08:00:00.0000000', timeZone: 'UTC' },
      end: { dateTime: '2026-07-16T08:30:00.0000000', timeZone: 'UTC' }
    },
    'cal-1'
  );
  assert.equal(event.start.iso, '2026-07-16T08:00:00.000Z');
  assert.equal(event.end.iso, '2026-07-16T08:30:00.000Z');
});

test('single-day Google all-day event does not spill into the next day', () => {
  // Google reports all-day ends EXCLUSIVE: a one-day event on the 16th
  // has end.date = the 17th.
  const event = normalizeGoogleEvent(
    {
      id: 'g-1',
      summary: 'Public holiday',
      start: { date: '2026-07-16' },
      end: { date: '2026-07-17' }
    },
    'cal-1'
  );
  assert.equal(event.start.iso.slice(0, 10), '2026-07-16');
  assert.equal(event.end.iso.slice(0, 10), '2026-07-16');
});

test('all-day events round-trip: serialize restores the exclusive end', () => {
  const normalized = normalizeGoogleEvent(
    { id: 'g-2', summary: 'Trip', start: { date: '2026-07-16' }, end: { date: '2026-07-19' } },
    'cal-1'
  );
  assert.equal(normalized.end.iso.slice(0, 10), '2026-07-18');
  const wire = serializeGoogleEvent(normalized);
  assert.deepEqual(wire.start, { date: '2026-07-16' });
  assert.deepEqual(wire.end, { date: '2026-07-19' });
});

const wrapIcs = (body) => ['BEGIN:VCALENDAR', body, 'END:VCALENDAR'].join('\r\n');

test('ICS parser honours TZID instead of the viewer zone', () => {
  const ics = wrapIcs([
    'BEGIN:VEVENT',
    'UID:tz-1',
    'SUMMARY:London meeting',
    'DTSTART;TZID=Europe/London:20260716T080000',
    'DTEND;TZID=Europe/London:20260716T090000',
    'END:VEVENT'
  ].join('\r\n'));
  const [event] = parseIcsText(ics, 'ics-cal', '2026-07-01T00:00:00Z', '2026-08-01T00:00:00Z');
  assert.ok(event);
  assert.equal(event.start.iso, '2026-07-16T07:00:00.000Z'); // 08:00 BST
});

test('ICS VALARM properties do not clobber the parent event', () => {
  const ics = wrapIcs([
    'BEGIN:VEVENT',
    'UID:alarm-1',
    'SUMMARY:Dentist',
    'DESCRIPTION:Bring the referral letter',
    'DTSTART:20260716T100000Z',
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Reminder',
    'END:VALARM',
    'END:VEVENT'
  ].join('\r\n'));
  const [event] = parseIcsText(ics, 'ics-cal', '2026-07-01T00:00:00Z', '2026-08-01T00:00:00Z');
  assert.ok(event);
  assert.equal(event.title, 'Dentist');
  assert.equal(event.description, 'Bring the referral letter');
});
