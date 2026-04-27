import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isCalendarProvider,
  isIsoDateTime,
  sanitizeAvatar,
  sanitizeCalendarState,
  sanitizeMoneyState,
  sanitizeNormalizedCalendar,
  sanitizeNormalizedEvent
} from '../domain/sanitize.ts';

test('isCalendarProvider only accepts known providers', () => {
  assert.equal(isCalendarProvider('google'), true);
  assert.equal(isCalendarProvider('microsoft'), true);
  assert.equal(isCalendarProvider('ics'), true);
  assert.equal(isCalendarProvider('caldav'), true);
  assert.equal(isCalendarProvider('aol'), false);
  assert.equal(isCalendarProvider(undefined), false);
});

test('isIsoDateTime rejects malformed timestamps', () => {
  assert.equal(isIsoDateTime('2026-04-27T12:00:00Z'), true);
  assert.equal(isIsoDateTime('not a date'), false);
  assert.equal(isIsoDateTime(undefined), false);
});

test('sanitizeNormalizedCalendar drops calendars missing required fields', () => {
  assert.equal(sanitizeNormalizedCalendar(null), null);
  assert.equal(sanitizeNormalizedCalendar({ id: 'c1', name: 'Work', provider: 'aol' }), null);

  const ok = sanitizeNormalizedCalendar({
    id: 'c1',
    name: 'Work',
    provider: 'google',
    primary: true,
    color: '#fff',
    accountLabel: 'me@example.com',
    extra: 'ignored'
  });
  assert.equal(ok?.id, 'c1');
  assert.equal(ok?.primary, true);
  assert.equal('extra' in (ok ?? {}), false);
});

test('sanitizeNormalizedEvent drops events with bad timestamps', () => {
  assert.equal(
    sanitizeNormalizedEvent({
      id: 'e1',
      calendarId: 'c1',
      title: 'Soccer',
      provider: 'google',
      start: { iso: 'nope' },
      end: { iso: 'nope' }
    }),
    null
  );
});

test('sanitizeCalendarState filters bad inputs and preserves shape', () => {
  const result = sanitizeCalendarState({
    events: [
      { id: 'a', title: 'Family dinner', date: '2026-05-01' },
      { id: 'b', title: 'Bad' } // missing date — dropped
    ],
    externalEvents: [
      {
        id: 'e1',
        calendarId: 'c1',
        title: 'Soccer',
        provider: 'google',
        start: { iso: '2026-05-01T16:00:00Z', allDay: false },
        end: { iso: '2026-05-01T17:00:00Z', allDay: false }
      },
      { id: 'bad', provider: 'google' } // missing fields — dropped
    ],
    calendars: [
      { id: 'c1', name: 'Work', provider: 'google' },
      null
    ],
    lastSyncedAtIsoByProvider: {
      google: '2026-04-27T10:00:00Z',
      bogus: '2026-04-27T10:00:00Z'
    }
  });

  assert.equal(result.events.length, 1);
  assert.equal(result.externalEvents.length, 1);
  assert.equal(result.calendars.length, 1);
  assert.deepEqual(Object.keys(result.lastSyncedAtIsoByProvider), ['google']);
});

test('sanitizeAvatar falls back when fields are invalid', () => {
  const fallback = {
    mood: 'happy',
    points: 10,
    familyContribution: 5,
    look: { body: 'fox', outfit: 'cozy', accessory: 'star', collar: 'blue' },
    inventory: ['pouch']
  };

  const sanitized = sanitizeAvatar(
    {
      mood: 'feral', // not in allowlist → fallback
      points: 'a lot', // wrong type → fallback
      look: { body: 'dragon' } // not in allowlist → fallback
    },
    fallback
  );

  assert.equal(sanitized.mood, 'happy');
  assert.equal(sanitized.points, 10);
  assert.equal(sanitized.look.body, 'fox');
});

test('sanitizeMoneyState migrates legacy payments[] and actualTransactions[] shapes', () => {
  const result = sanitizeMoneyState({
    payments: [
      { id: 'p1', title: 'Rent', amount: 1200, dueDate: '2026-05-01', category: 'Housing' }
    ],
    actualTransactions: [
      { id: 't1', title: 'Coffee', amount: 35, date: '2026-04-26', kind: 'outflow', category: 'Food' }
    ],
    settings: { monthlyStartDay: 1 }
  });

  assert.equal(result.bills.length, 1);
  assert.equal(result.bills[0].amountCents, 120000); // 1200 → 120000 cents
  assert.equal(result.transactions.length, 1);
  assert.equal(result.transactions[0].amountCents, 3500);
  assert.equal(result.transactions[0].source, 'manual');
  assert.equal(result.settings.currency, 'ZAR');
});

test('sanitizeMoneyState preserves recurrence on the modern bills[] shape', () => {
  const result = sanitizeMoneyState({
    bills: [
      {
        id: 'b1',
        title: 'Rent',
        amountCents: 120000,
        dueDateIso: '2026-05-01',
        category: 'Housing',
        paid: false,
        recurrence: 'monthly',
        recurrenceDay: 1
      }
    ],
    transactions: []
  });
  assert.equal(result.bills[0].recurrence, 'monthly');
  assert.equal(result.bills[0].recurrenceDay, 1);
});

test('sanitizeMoneyState drops malformed planner items', () => {
  const result = sanitizeMoneyState({
    bills: [],
    transactions: [],
    plannerItems: [
      { id: 'p1', description: 'Salary', kind: 'income', defaultAmountCents: 5000000 },
      { id: 'p2', kind: 'income' }, // missing description — dropped
      { id: 'p3', description: 'Bad', kind: 'invalid' } // bad kind — dropped
    ]
  });

  assert.equal(result.plannerItems.length, 1);
  assert.equal(result.plannerItems[0].id, 'p1');
});
