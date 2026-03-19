import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAllDayRange, toDedupeKey } from '../domain/calendar.ts';

test('dedupe key format', () => {
  assert.equal(toDedupeKey({ provider: 'google', calendarId: 'a', id: '1' }), 'google:a:1');
});

test('all day helper marks allDay', () => {
  const out = normalizeAllDayRange('2026-03-15');
  assert.equal(out.start.allDay, true);
});
