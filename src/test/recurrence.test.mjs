import test from 'node:test';
import assert from 'node:assert/strict';
import { expandRecurrence, toRRuleText } from '../domain/recurrence.ts';

const seedEvent = {
  id: 'soccer',
  provider: 'google',
  calendarId: 'cal-1',
  title: 'Soccer practice',
  start: { iso: '2026-05-06T16:00:00.000Z', allDay: false }, // Wednesday
  end: { iso: '2026-05-06T17:00:00.000Z', allDay: false },
  source: 'internal'
};

test('expandRecurrence returns non-recurring events unchanged when in range', () => {
  const result = expandRecurrence(
    [{ ...seedEvent, rruleText: null }],
    '2026-05-01T00:00:00Z',
    '2026-05-31T23:59:59Z'
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'soccer');
});

test('expandRecurrence drops non-recurring events outside the range', () => {
  const result = expandRecurrence(
    [{ ...seedEvent, rruleText: null }],
    '2026-06-01T00:00:00Z',
    '2026-06-30T23:59:59Z'
  );
  assert.equal(result.length, 0);
});

test('expandRecurrence expands a weekly rrule into the right number of occurrences', () => {
  const result = expandRecurrence(
    [{ ...seedEvent, rruleText: 'RRULE:FREQ=WEEKLY;BYDAY=WE;COUNT=4' }],
    '2026-05-01T00:00:00Z',
    '2026-05-31T23:59:59Z'
  );
  // Wednesdays in May 2026: 6th, 13th, 20th, 27th — all within range.
  assert.equal(result.length, 4);
  for (const occ of result) {
    assert.match(occ.id, /^soccer::/);
    assert.equal(new Date(occ.start.iso).getUTCDay(), 3); // Wednesday
  }
});

test('expandRecurrence respects exception overrides', () => {
  const result = expandRecurrence(
    [
      {
        ...seedEvent,
        rruleText: 'RRULE:FREQ=WEEKLY;BYDAY=WE;COUNT=2',
        exceptions: {
          '2026-05-13T16:00:00.000Z': { startsAtIso: '2026-05-13T17:00:00.000Z', endsAtIso: '2026-05-13T18:00:00.000Z' }
        }
      }
    ],
    '2026-05-01T00:00:00Z',
    '2026-05-31T23:59:59Z'
  );
  assert.equal(result.length, 2);
  assert.equal(result[1].start.iso, '2026-05-13T17:00:00.000Z');
});

test('expandRecurrence drops cancelled occurrences', () => {
  const result = expandRecurrence(
    [
      {
        ...seedEvent,
        rruleText: 'RRULE:FREQ=WEEKLY;BYDAY=WE;COUNT=3',
        exceptions: { '2026-05-13T16:00:00.000Z': 'cancelled' }
      }
    ],
    '2026-05-01T00:00:00Z',
    '2026-05-31T23:59:59Z'
  );
  assert.equal(result.length, 2);
  for (const occ of result) {
    assert.notEqual(occ.start.iso, '2026-05-13T16:00:00.000Z');
  }
});

test('expandRecurrence preserves the seed event on a malformed RRULE', () => {
  const result = expandRecurrence(
    [{ ...seedEvent, rruleText: 'RRULE:GARBAGE' }],
    '2026-05-01T00:00:00Z',
    '2026-05-31T23:59:59Z'
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'soccer');
});

test('expandRecurrence sorts results by start time', () => {
  const a = { ...seedEvent, id: 'a', start: { iso: '2026-05-10T16:00:00.000Z', allDay: false }, end: { iso: '2026-05-10T17:00:00.000Z', allDay: false }, rruleText: null };
  const b = { ...seedEvent, id: 'b', start: { iso: '2026-05-05T16:00:00.000Z', allDay: false }, end: { iso: '2026-05-05T17:00:00.000Z', allDay: false }, rruleText: null };
  const result = expandRecurrence([a, b], '2026-05-01T00:00:00Z', '2026-05-31T23:59:59Z');
  assert.equal(result[0].id, 'b');
  assert.equal(result[1].id, 'a');
});

test('toRRuleText renders weekly recurrence with BYDAY', () => {
  const text = toRRuleText({ kind: 'weekly', byDay: ['MO', 'WE', 'FR'], count: 10 });
  assert.equal(text, 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=10');
});

test('toRRuleText renders interval and until', () => {
  const text = toRRuleText({
    kind: 'monthly',
    interval: 2,
    byMonthDay: 15,
    until: '2026-12-31T23:59:59Z'
  });
  assert.match(text, /^RRULE:FREQ=MONTHLY;BYMONTHDAY=15;INTERVAL=2;UNTIL=20261231T235959Z$/);
});

test('toRRuleText returns null for kind=none', () => {
  assert.equal(toRRuleText({ kind: 'none' }), null);
});

test('expandRecurrence respects tzid for wall-clock weekly recurrence', () => {
  // With tzid set, rrule interprets the wall-clock parts of dtstart as
  // local time in the named zone and emits subsequent occurrences at the
  // same wall-clock time. The invariant we want is "every occurrence has
  // the same wall-clock hour in Africa/Johannesburg" — the UTC offset
  // matters only for transport.
  const result = expandRecurrence(
    [
      {
        id: 'soccer',
        provider: 'google',
        calendarId: 'cal-1',
        title: 'Soccer practice',
        start: { iso: '2026-05-06T16:00:00.000Z', allDay: false },
        end: { iso: '2026-05-06T17:00:00.000Z', allDay: false },
        source: 'internal',
        tzid: 'Africa/Johannesburg',
        rruleText: 'RRULE:FREQ=WEEKLY;BYDAY=WE;COUNT=3'
      }
    ],
    '2026-05-01T00:00:00Z',
    '2026-05-31T23:59:59Z'
  );
  assert.equal(result.length, 3);
  // Africa/Johannesburg has no DST, so every occurrence's wall-clock hour
  // should match. We use Intl.DateTimeFormat to read the local hour back.
  const fmt = new Intl.DateTimeFormat('en-ZA', {
    timeZone: 'Africa/Johannesburg',
    hour: '2-digit',
    hour12: false
  });
  const hours = result.map((occ) => fmt.format(new Date(occ.start.iso)));
  // All three occurrences should land on the same wall-clock hour.
  assert.equal(new Set(hours).size, 1, `expected one unique hour, got ${[...new Set(hours)]}`);
});
