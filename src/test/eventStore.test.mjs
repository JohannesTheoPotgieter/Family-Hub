// Integration test for server/calendar/eventStore.mjs.
//
// Skipped when DATABASE_URL is unset (local dev / minimal CI). When
// DATABASE_URL is pointed at a Postgres instance with migrations applied,
// the test suite exercises the create → read → update → delete flow plus
// optimistic-concurrency etag enforcement and the lazy-thread helper.

import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const skip = !process.env.DATABASE_URL ? { skip: 'DATABASE_URL not set; skipping eventStore integration tests.' } : {};

const importStore = async () => {
  const { getPool, closePool } = await import('../../server/db/pool.mjs');
  const store = await import('../../server/calendar/eventStore.mjs');
  return { ...store, getPool, closePool };
};

const seedFamily = async (pool) => {
  const familyId = randomUUID();
  const memberId = randomUUID();
  await pool.query(
    `INSERT INTO families (id, name, owner_user_id, locale) VALUES ($1, 'Test family', $2, 'GLOBAL')`,
    [familyId, randomUUID()]
  );
  await pool.query(
    `INSERT INTO family_members (id, family_id, user_id, display_name, role_key, status)
     VALUES ($1, $2, $3, 'Mom', 'parent_admin', 'active')`,
    [memberId, familyId, randomUUID()]
  );
  return { familyId, memberId };
};

const cleanupFamily = async (pool, familyId) => {
  await pool.query(`DELETE FROM families WHERE id = $1`, [familyId]);
};

test('eventStore: create + list + update + delete end to end', skip, async () => {
  const { createEvent, listFamilyEvents, updateEvent, deleteEvent, getPool, closePool } = await importStore();
  const pool = getPool();
  const { familyId, memberId } = await seedFamily(pool);
  try {
    const created = await createEvent({
      familyId,
      actorMemberId: memberId,
      event: {
        title: 'Soccer practice',
        startsAt: '2026-05-06T16:00:00Z',
        endsAt: '2026-05-06T17:00:00Z',
        rruleText: 'RRULE:FREQ=WEEKLY;BYDAY=WE;COUNT=4',
        attendeeMemberIds: [memberId]
      }
    });
    assert.equal(created.title, 'Soccer practice');
    assert.equal(created.attendeeIds.length, 1);

    const events = await listFamilyEvents({
      familyId,
      fromIso: '2026-05-01T00:00:00Z',
      toIso: '2026-05-31T23:59:59Z'
    });
    assert.equal(events.length, 1);
    assert.equal(events[0].id, created.id);

    const updated = await updateEvent({
      familyId,
      actorMemberId: memberId,
      eventId: created.id,
      patch: { title: 'Soccer (rescheduled)' }
    });
    assert.equal(updated.title, 'Soccer (rescheduled)');

    await deleteEvent({ familyId, actorMemberId: memberId, eventId: created.id });

    const after = await listFamilyEvents({
      familyId,
      fromIso: '2026-05-01T00:00:00Z',
      toIso: '2026-05-31T23:59:59Z'
    });
    assert.equal(after.length, 0);
  } finally {
    await cleanupFamily(pool, familyId);
    await closePool();
  }
});

test('eventStore: optimistic-concurrency rejects stale etag updates', skip, async () => {
  const { createEvent, updateEvent, getPool, closePool } = await importStore();
  const pool = getPool();
  const { familyId, memberId } = await seedFamily(pool);
  try {
    const created = await createEvent({
      familyId,
      actorMemberId: memberId,
      event: {
        title: 'Standup',
        startsAt: '2026-05-06T09:00:00Z',
        endsAt: '2026-05-06T09:30:00Z'
      }
    });

    // Stamp a known etag, then attempt an update with the wrong expected.
    await pool.query(`UPDATE internal_events SET etag = 'rev-1' WHERE id = $1`, [created.id]);
    await assert.rejects(
      updateEvent({
        familyId,
        actorMemberId: memberId,
        eventId: created.id,
        patch: { title: 'Hijacked' },
        expectedEtag: 'rev-0'
      }),
      (err) => err.message === 'concurrent_modification'
    );
  } finally {
    await cleanupFamily(pool, familyId);
    await closePool();
  }
});

test('eventStore: ensureEventThread is idempotent and creates an object thread', skip, async () => {
  const { createEvent, ensureEventThread, getPool, closePool } = await importStore();
  const pool = getPool();
  const { familyId, memberId } = await seedFamily(pool);
  try {
    const created = await createEvent({
      familyId,
      actorMemberId: memberId,
      event: {
        title: 'Dentist',
        startsAt: '2026-05-07T10:00:00Z',
        endsAt: '2026-05-07T11:00:00Z'
      }
    });
    const first = await ensureEventThread({ familyId, eventId: created.id });
    const second = await ensureEventThread({ familyId, eventId: created.id });
    assert.equal(first, second);

    const { rows } = await pool.query(
      `SELECT kind, entity_kind, entity_id FROM threads WHERE id = $1`,
      [first]
    );
    assert.equal(rows[0].kind, 'object');
    assert.equal(rows[0].entity_kind, 'event');
    assert.equal(rows[0].entity_id, created.id);
  } finally {
    await cleanupFamily(pool, familyId);
    await closePool();
  }
});
