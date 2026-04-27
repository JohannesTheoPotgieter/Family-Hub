import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findConflicts,
  serializeGoogleEvent,
  serializeMicrosoftEvent,
  normalizeGoogleEvent,
  normalizeMicrosoftEvent
} from '../domain/calendar.ts';

// --- serializers ---------------------------------------------------------

test('serializeGoogleEvent round-trips through normalizeGoogleEvent for timed events', () => {
  const event = {
    id: 'evt1',
    provider: 'google',
    calendarId: 'cal-1',
    title: 'Standup',
    description: 'daily',
    location: 'Office',
    start: { iso: '2026-05-06T09:00:00.000Z', allDay: false },
    end: { iso: '2026-05-06T09:30:00.000Z', allDay: false },
    source: 'internal'
  };
  const wire = serializeGoogleEvent(event);
  assert.equal(wire.summary, 'Standup');
  assert.equal(wire.start.dateTime, '2026-05-06T09:00:00.000Z');

  const round = normalizeGoogleEvent(
    {
      id: wire.id,
      summary: wire.summary,
      description: wire.description,
      location: wire.location,
      start: wire.start,
      end: wire.end
    },
    'cal-1'
  );
  assert.equal(round.title, 'Standup');
  assert.equal(round.start.iso, event.start.iso);
});

test('serializeGoogleEvent uses date-only fields for all-day events', () => {
  const wire = serializeGoogleEvent({
    id: 'h1',
    provider: 'google',
    calendarId: 'cal-1',
    title: 'Public holiday',
    start: { iso: '2026-04-27T12:00:00.000Z', allDay: true },
    end: { iso: '2026-04-27T12:00:00.000Z', allDay: true },
    source: 'internal'
  });
  assert.equal('date' in wire.start ? wire.start.date : null, '2026-04-27');
});

test('serializeMicrosoftEvent emits UTC timezone + dateTime fields', () => {
  const wire = serializeMicrosoftEvent({
    id: 'evt2',
    provider: 'microsoft',
    calendarId: 'cal-1',
    title: 'Sync',
    start: { iso: '2026-05-06T09:00:00.000Z', allDay: false },
    end: { iso: '2026-05-06T09:30:00.000Z', allDay: false },
    source: 'internal'
  });
  assert.equal(wire.subject, 'Sync');
  assert.equal(wire.start.timeZone, 'UTC');
  assert.equal(wire.start.dateTime, '2026-05-06T09:00:00.000Z');

  // round-trip via the normalizer
  const round = normalizeMicrosoftEvent(
    {
      id: wire.id,
      subject: wire.subject,
      bodyPreview: wire.body?.content,
      start: wire.start,
      end: wire.end,
      isAllDay: wire.isAllDay
    },
    'cal-1'
  );
  assert.equal(round.title, 'Sync');
  assert.equal(round.start.iso, '2026-05-06T09:00:00.000Z');
});

// --- conflicts -----------------------------------------------------------

const evt = (id, start, end, attendeeIds = []) => ({
  id,
  start: { iso: start },
  end: { iso: end },
  attendeeIds
});

test('findConflicts returns empty when events do not overlap', () => {
  const events = [
    evt('a', '2026-05-06T09:00:00Z', '2026-05-06T10:00:00Z'),
    evt('b', '2026-05-06T10:00:00Z', '2026-05-06T11:00:00Z')
  ];
  assert.deepEqual(findConflicts(events), []);
});

test('findConflicts catches overlapping events', () => {
  const events = [
    evt('a', '2026-05-06T09:00:00Z', '2026-05-06T10:30:00Z'),
    evt('b', '2026-05-06T10:00:00Z', '2026-05-06T11:00:00Z')
  ];
  const conflicts = findConflicts(events);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].a.id, 'a');
  assert.equal(conflicts[0].b.id, 'b');
});

test('findConflicts surfaces shared attendees as the strong signal', () => {
  const events = [
    evt('meeting', '2026-05-06T09:00:00Z', '2026-05-06T10:00:00Z', ['mom']),
    evt('soccer', '2026-05-06T09:30:00Z', '2026-05-06T10:30:00Z', ['mom', 'liam'])
  ];
  const conflicts = findConflicts(events);
  assert.equal(conflicts.length, 1);
  assert.deepEqual(conflicts[0].sharedAttendeeIds, ['mom']);
});

test('findConflicts handles a chain of three overlapping events', () => {
  const events = [
    evt('a', '2026-05-06T09:00:00Z', '2026-05-06T11:00:00Z'),
    evt('b', '2026-05-06T10:00:00Z', '2026-05-06T12:00:00Z'),
    evt('c', '2026-05-06T10:30:00Z', '2026-05-06T11:30:00Z')
  ];
  const conflicts = findConflicts(events);
  // (a,b), (a,c), (b,c) all overlap.
  assert.equal(conflicts.length, 3);
});

test('findConflicts treats touching boundaries as non-overlapping', () => {
  const events = [
    evt('a', '2026-05-06T09:00:00Z', '2026-05-06T10:00:00Z', ['mom']),
    evt('b', '2026-05-06T10:00:00Z', '2026-05-06T11:00:00Z', ['mom'])
  ];
  assert.deepEqual(findConflicts(events), []);
});
