// internal_events DB layer (Phase 1.4 + 1.6).
//
// Pure CRUD against the internal_events + event_attendees tables, scoped
// through withFamilyContext so RLS does its job. Provider write-through is
// orchestrated one layer up in routes.mjs — this module never talks to
// Google/Microsoft directly so it stays unit-testable.
//
// The shape returned mirrors the NormalizedEvent type (src/domain/calendar)
// plus a few server-only fields (etag, recurrenceParentId, attendeeIds) so
// callers can build a single in-memory list and run findConflicts /
// expandRecurrence over it without conversion.

import { withFamilyContext, withTransaction } from '../db/pool.mjs';
import { scheduleEventReminder, cancelEventReminder } from './reminders.mjs';

const rowToEvent = (row) => ({
  id: row.id,
  provider: row.calendar_connection_id ? 'google' : 'internal', // refined when joined w/ connection
  calendarId: row.calendar_connection_id ?? 'internal',
  title: row.title,
  description: row.description ?? undefined,
  location: row.location ?? undefined,
  start: { iso: row.starts_at, allDay: row.all_day },
  end: { iso: row.ends_at, allDay: row.all_day },
  rruleText: row.rrule_text ?? null,
  recurrenceParentId: row.recurrence_parent_id ?? null,
  etag: row.etag ?? null,
  threadId: row.thread_id ?? null,
  source: 'internal',
  attendeeIds: row.attendee_ids ?? []
});

/**
 * @param {{ familyId: string, fromIso: string, toIso: string }} args
 */
export const listFamilyEvents = async ({ familyId, fromIso, toIso }) =>
  withFamilyContext(familyId, async (client) => {
    // The window check uses ends_at >= fromIso AND starts_at <= toIso so
    // events partially in-range still surface. Recurring events with no
    // upper bound are pulled regardless of window — caller expands them
    // via expandRecurrence and trims.
    const { rows } = await client.query(
      `SELECT e.*, COALESCE(array_agg(ea.member_id) FILTER (WHERE ea.member_id IS NOT NULL), '{}') AS attendee_ids
         FROM internal_events e
         LEFT JOIN event_attendees ea ON ea.event_id = e.id
        WHERE (e.rrule_text IS NOT NULL)
           OR (e.ends_at >= $1 AND e.starts_at <= $2)
        GROUP BY e.id
        ORDER BY e.starts_at`,
      [fromIso, toIso]
    );
    return rows.map(rowToEvent);
  });

/**
 * Insert a new event + attendees + audit row in a single transaction.
 *
 * @param {{
 *   familyId: string,
 *   actorMemberId: string,
 *   event: {
 *     title: string,
 *     description?: string | null,
 *     location?: string | null,
 *     startsAt: string,
 *     endsAt: string,
 *     allDay?: boolean,
 *     rruleText?: string | null,
 *     calendarConnectionId?: string | null,
 *     attendeeMemberIds?: string[]
 *   }
 * }} args
 */
export const createEvent = async ({ familyId, actorMemberId, event }) =>
  withFamilyContext(familyId, (client) =>
    withTransaction(client, async () => {
      const { rows } = await client.query(
        `INSERT INTO internal_events (
            family_id, calendar_connection_id, title, description, location,
            starts_at, ends_at, all_day, rrule_text, created_by_member_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING *`,
        [
          familyId,
          event.calendarConnectionId ?? null,
          event.title,
          event.description ?? null,
          event.location ?? null,
          event.startsAt,
          event.endsAt,
          Boolean(event.allDay),
          event.rruleText ?? null,
          actorMemberId
        ]
      );
      const row = rows[0];

      const attendees = event.attendeeMemberIds ?? [];
      if (attendees.length) {
        await insertAttendees(client, row.id, attendees, actorMemberId);
      }

      await audit(client, {
        familyId,
        actorMemberId,
        action: 'event.created',
        entityKind: 'event',
        entityId: row.id,
        diff: { title: event.title, startsAt: event.startsAt, endsAt: event.endsAt }
      });

      // Schedule reminders for each attendee. Fail-soft: if BullMQ isn't
      // configured (no REDIS_URL), the helpers return null and we move on.
      // Reminders are best-effort — we never want a queue outage to block
      // an event being created.
      for (const attendeeId of attendees) {
        await scheduleEventReminder({
          familyId,
          memberId: attendeeId,
          eventId: row.id,
          title: event.title,
          startsAt: event.startsAt
        }).catch(() => {});
      }

      return rowToEvent({ ...row, attendee_ids: attendees });
    })
  );

/**
 * Patch an event. `expectedEtag` is optional optimistic-concurrency control —
 * when supplied, the update fails with a `concurrent_modification` error if
 * the row's etag has moved. Routes use this when relaying writes from the
 * provider sync worker so a same-second edit on the user's phone wins.
 *
 * @param {{
 *   familyId: string,
 *   actorMemberId: string,
 *   eventId: string,
 *   patch: Partial<{
 *     title: string,
 *     description: string | null,
 *     location: string | null,
 *     startsAt: string,
 *     endsAt: string,
 *     allDay: boolean,
 *     rruleText: string | null,
 *     attendeeMemberIds: string[],
 *     newEtag: string,
 *     lastModifiedRemote: string
 *   }>,
 *   expectedEtag?: string | null
 * }} args
 */
export const updateEvent = async ({ familyId, actorMemberId, eventId, patch, expectedEtag }) =>
  withFamilyContext(familyId, (client) =>
    withTransaction(client, async () => {
      // Lock the row so attendees + audit see a consistent snapshot.
      const { rows: currentRows } = await client.query(
        `SELECT * FROM internal_events WHERE id = $1 FOR UPDATE`,
        [eventId]
      );
      if (!currentRows.length) {
        const err = new Error('event not found');
        err.status = 404;
        throw err;
      }
      const current = currentRows[0];

      if (expectedEtag !== undefined && expectedEtag !== null && current.etag !== expectedEtag) {
        const err = new Error('concurrent_modification');
        err.status = 409;
        err.detail = { currentEtag: current.etag };
        throw err;
      }

      const set = [];
      const values = [];
      const push = (column, value) => {
        values.push(value);
        set.push(`${column} = $${values.length}`);
      };
      if (patch.title !== undefined) push('title', patch.title);
      if (patch.description !== undefined) push('description', patch.description);
      if (patch.location !== undefined) push('location', patch.location);
      if (patch.startsAt !== undefined) push('starts_at', patch.startsAt);
      if (patch.endsAt !== undefined) push('ends_at', patch.endsAt);
      if (patch.allDay !== undefined) push('all_day', patch.allDay);
      if (patch.rruleText !== undefined) push('rrule_text', patch.rruleText);
      if (patch.newEtag !== undefined) push('etag', patch.newEtag);
      if (patch.lastModifiedRemote !== undefined) push('last_modified_remote', patch.lastModifiedRemote);
      set.push('updated_at = now()');

      let updated = current;
      if (set.length > 1) {
        // Apply only when the caller actually changed something.
        values.push(eventId);
        const { rows } = await client.query(
          `UPDATE internal_events SET ${set.join(', ')} WHERE id = $${values.length} RETURNING *`,
          values
        );
        updated = rows[0];
      }

      let attendeeIds;
      if (patch.attendeeMemberIds) {
        await client.query(`DELETE FROM event_attendees WHERE event_id = $1`, [eventId]);
        if (patch.attendeeMemberIds.length) {
          await insertAttendees(client, eventId, patch.attendeeMemberIds, actorMemberId);
        }
        attendeeIds = patch.attendeeMemberIds;
      } else {
        const { rows } = await client.query(
          `SELECT member_id FROM event_attendees WHERE event_id = $1`,
          [eventId]
        );
        attendeeIds = rows.map((r) => r.member_id);
      }

      await audit(client, {
        familyId,
        actorMemberId,
        action: 'event.updated',
        entityKind: 'event',
        entityId: eventId,
        diff: patchDiff(current, updated, attendeeIds)
      });

      // Re-schedule reminders if the start moved or attendee set changed.
      const startMoved = current.starts_at !== updated.starts_at;
      const attendeesChanged = Array.isArray(patch.attendeeMemberIds);
      if (startMoved || attendeesChanged) {
        for (const attendeeId of attendeeIds) {
          await scheduleEventReminder({
            familyId,
            memberId: attendeeId,
            eventId,
            title: updated.title,
            startsAt: updated.starts_at
          }).catch(() => {});
        }
      }

      return rowToEvent({ ...updated, attendee_ids: attendeeIds });
    })
  );

export const deleteEvent = async ({ familyId, actorMemberId, eventId }) =>
  withFamilyContext(familyId, async (client) => {
    // Read attendees before delete so we can cancel their reminders. Done
    // outside the transaction since DELETE … RETURNING with FK cascade
    // doesn't return removed attendee rows.
    const { rows: attendeeRows } = await client.query(
      `SELECT member_id FROM event_attendees WHERE event_id = $1`,
      [eventId]
    );
    const attendeeIds = attendeeRows.map((r) => r.member_id);

    const result = await withTransaction(client, async () => {
      const { rowCount, rows } = await client.query(
        `DELETE FROM internal_events WHERE id = $1 RETURNING id, calendar_connection_id, etag`,
        [eventId]
      );
      if (!rowCount) {
        const err = new Error('event not found');
        err.status = 404;
        throw err;
      }
      await audit(client, {
        familyId,
        actorMemberId,
        action: 'event.deleted',
        entityKind: 'event',
        entityId: eventId,
        diff: {}
      });
      return rows[0];
    });

    for (const attendeeId of attendeeIds) {
      await cancelEventReminder({ eventId, memberId: attendeeId }).catch(() => {});
    }
    return result;
  });

/**
 * Lazily attach (or fetch) the object thread for an event. Keeping the
 * thread-creation logic next to the event store avoids a round-trip when
 * the connective-chat layer (Phase 3) needs to render the thread for the
 * first time — same transaction, no race.
 */
/**
 * Persist provider-sync metadata (etag, lastModifiedRemote, externalId)
 * without writing an audit row or rescheduling reminders. Used by
 * mirrorOutbound + syncWorker so a successful provider call doesn't
 * pollute the audit log with "event.updated" noise that wasn't a user
 * action.
 *
 * @param {{
 *   familyId: string,
 *   eventId: string,
 *   etag?: string | null,
 *   lastModifiedRemote?: string | null,
 *   externalId?: string | null
 * }} args
 */
export const recordEventSyncMetadata = async ({ familyId, eventId, etag, lastModifiedRemote, externalId }) =>
  withFamilyContext(familyId, async (client) => {
    const set = [];
    const values = [];
    const push = (column, value) => {
      values.push(value);
      set.push(`${column} = $${values.length}`);
    };
    if (etag !== undefined) push('etag', etag);
    if (lastModifiedRemote !== undefined) push('last_modified_remote', lastModifiedRemote);
    if (externalId !== undefined) push('external_id', externalId);
    if (!set.length) return;
    values.push(eventId);
    await client.query(
      `UPDATE internal_events SET ${set.join(', ')} WHERE id = $${values.length}`,
      values
    );
  });

export const ensureEventThread = async ({ familyId, eventId }) =>
  withFamilyContext(familyId, (client) =>
    withTransaction(client, async () => {
      const { rows: existing } = await client.query(
        `SELECT thread_id FROM internal_events WHERE id = $1 FOR UPDATE`,
        [eventId]
      );
      if (!existing.length) {
        const err = new Error('event not found');
        err.status = 404;
        throw err;
      }
      if (existing[0].thread_id) return existing[0].thread_id;

      // Object threads are server-readable (intentional — see plan §
      // Connective Chat privacy posture).
      const { rows: thread } = await client.query(
        `INSERT INTO threads (family_id, kind, entity_kind, entity_id, e2e_encrypted)
         VALUES ($1, 'object', 'event', $2, false)
         RETURNING id`,
        [familyId, eventId]
      );
      const threadId = thread[0].id;
      await client.query(
        `UPDATE internal_events SET thread_id = $1 WHERE id = $2`,
        [threadId, eventId]
      );
      return threadId;
    })
  );

// --- helpers -------------------------------------------------------------

const insertAttendees = async (client, eventId, memberIds, organizerId) => {
  // Bulk insert; mark the organizer if they're in the list.
  const values = [];
  const placeholders = memberIds
    .map((memberId, i) => {
      const base = i * 3;
      values.push(eventId, memberId, memberId === organizerId);
      return `($${base + 1}, $${base + 2}, 'pending', $${base + 3})`;
    })
    .join(', ');
  await client.query(
    `INSERT INTO event_attendees (event_id, member_id, rsvp, is_organizer)
     VALUES ${placeholders}
     ON CONFLICT (event_id, member_id) DO NOTHING`,
    values
  );
};

const audit = async (client, { familyId, actorMemberId, action, entityKind, entityId, diff }) => {
  await client.query(
    `INSERT INTO audit_log (family_id, actor_member_id, action, entity_kind, entity_id, diff)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [familyId, actorMemberId, action, entityKind, entityId, JSON.stringify(diff)]
  );
};

const patchDiff = (before, after, attendeeIds) => {
  const diff = {};
  for (const key of ['title', 'description', 'location', 'starts_at', 'ends_at', 'all_day', 'rrule_text']) {
    if (before[key] !== after[key]) diff[key] = { from: before[key], to: after[key] };
  }
  if (attendeeIds) diff.attendees = attendeeIds;
  return diff;
};
