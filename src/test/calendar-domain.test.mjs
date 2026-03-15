import test from 'node:test';
import assert from 'node:assert/strict';

const toDedupeKey = (event) => `${event.provider}:${event.calendarId}:${event.id}`;
const normalizeAllDayRange = (startDate) => ({ start: { iso: new Date(`${startDate}T12:00:00`).toISOString(), allDay: true } });

test('dedupe key format', () => {
  assert.equal(toDedupeKey({ provider: 'google', calendarId: 'a', id: '1' }), 'google:a:1');
});

test('all day helper marks allDay', () => {
  const out = normalizeAllDayRange('2026-03-15');
  assert.equal(out.start.allDay, true);
});
