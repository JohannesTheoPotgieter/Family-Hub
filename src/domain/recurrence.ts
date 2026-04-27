// Recurrence expansion (Phase 1.2).
//
// Internal events store an `rruleText` (RFC 5545 RRULE/EXDATE/RDATE block)
// alongside their first-occurrence start/end. `expandRecurrence` turns a
// list of internal events into the concrete occurrences inside [from, to].
//
// We treat events as fully-qualified UTC ISO strings. Wall-clock recurrence
// (e.g. "8am every Monday in Africa/Johannesburg") is representable via
// DTSTART;TZID inside `rruleText`; the rrule lib handles it via the optional
// `tzid` field on the RRule itself. Phase 1 ships UTC-only — DST + cross-tz
// is Phase 5.
//
// Pure module, fully testable. Heavy lifting delegated to rrule.

import rrulePkg from 'rrule';
import type { NormalizedEvent } from './calendar.ts';

const { rrulestr } = rrulePkg as unknown as { rrulestr: (s: string, opts?: { dtstart?: Date }) => { between: (a: Date, b: Date, inclusive?: boolean) => Date[] } };

export type ExpandableEvent = NormalizedEvent & {
  rruleText?: string | null;
  // Override durations for specific occurrences. Map keyed by the occurrence's
  // ISO start. Phase 2 wires this via internal_events.recurrence_parent_id.
  exceptions?: Record<string, { startsAtIso: string; endsAtIso: string } | 'cancelled'>;
};

const startMs = (event: ExpandableEvent) => Date.parse(event.start.iso);
const endMs = (event: ExpandableEvent) => Date.parse(event.end.iso);

const stripDtstartLine = (rruleText: string) =>
  rruleText
    .split(/\r?\n/)
    .filter((line) => !/^DTSTART[:;]/i.test(line))
    .join('\n');

/**
 * Expand each event's rrule into individual occurrences inside [from, to].
 * Non-recurring events pass through untouched (when they fall in range).
 *
 * Returned occurrences carry the original `id` suffixed with the occurrence
 * timestamp so callers can dedupe; `recurrenceParentId` points at the
 * source event.
 */
export const expandRecurrence = (
  events: ExpandableEvent[],
  fromIso: string,
  toIso: string
): NormalizedEvent[] => {
  const fromMs = Date.parse(fromIso);
  const toMs = Date.parse(toIso);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) return [];

  const out: NormalizedEvent[] = [];

  for (const event of events) {
    if (!event.rruleText) {
      // Non-recurring — include if it overlaps the window.
      if (endMs(event) >= fromMs && startMs(event) <= toMs) out.push(event);
      continue;
    }

    let rule;
    try {
      const rruleBody = stripDtstartLine(event.rruleText);
      rule = rrulestr(rruleBody, { dtstart: new Date(event.start.iso) });
    } catch {
      // Bad RRULE — fall back to the seed occurrence so we never silently
      // drop the event.
      if (endMs(event) >= fromMs && startMs(event) <= toMs) out.push(event);
      continue;
    }

    const durationMs = Math.max(0, endMs(event) - startMs(event));
    // rrule.between is exclusive; pad by 1ms on the upper bound so events
    // ending exactly at `toIso` are kept.
    const occurrences = rule.between(new Date(fromMs), new Date(toMs + 1), true);

    for (const occ of occurrences) {
      const occIso = occ.toISOString();
      const exception = event.exceptions?.[occIso];
      if (exception === 'cancelled') continue;

      const startsAt = exception?.startsAtIso ?? occIso;
      const endsAt = exception?.endsAtIso ?? new Date(occ.getTime() + durationMs).toISOString();

      out.push({
        ...event,
        id: `${event.id}::${occIso}`,
        start: { iso: startsAt, allDay: event.start.allDay },
        end: { iso: endsAt, allDay: event.end.allDay }
      });
    }
  }

  out.sort((a, b) => Date.parse(a.start.iso) - Date.parse(b.start.iso));
  return out;
};

/**
 * Build an RRULE text from a small structured shape. Useful for the UI
 * "every Wednesday at 4pm" affordance — most users never write RRULE by
 * hand. More elaborate shapes can be authored manually and stored verbatim.
 */
export type SimpleRecurrence =
  | { kind: 'none' }
  | { kind: 'daily'; interval?: number; count?: number; until?: string }
  | { kind: 'weekly'; interval?: number; byDay?: WeekdayCode[]; count?: number; until?: string }
  | { kind: 'monthly'; interval?: number; byMonthDay?: number; count?: number; until?: string }
  | { kind: 'yearly'; interval?: number; count?: number; until?: string };

export type WeekdayCode = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

const formatUntil = (until: string) =>
  until.replace(/[-:]/g, '').replace(/\.\d{3}/, '').replace(/Z$/, 'Z');

export const toRRuleText = (recurrence: SimpleRecurrence): string | null => {
  if (recurrence.kind === 'none') return null;

  const parts = [];
  switch (recurrence.kind) {
    case 'daily':
      parts.push('FREQ=DAILY');
      break;
    case 'weekly':
      parts.push('FREQ=WEEKLY');
      if (recurrence.byDay?.length) parts.push(`BYDAY=${recurrence.byDay.join(',')}`);
      break;
    case 'monthly':
      parts.push('FREQ=MONTHLY');
      if (recurrence.byMonthDay) parts.push(`BYMONTHDAY=${recurrence.byMonthDay}`);
      break;
    case 'yearly':
      parts.push('FREQ=YEARLY');
      break;
  }
  if (recurrence.interval && recurrence.interval > 1) parts.push(`INTERVAL=${recurrence.interval}`);
  if (recurrence.count) parts.push(`COUNT=${recurrence.count}`);
  if (recurrence.until) parts.push(`UNTIL=${formatUntil(recurrence.until)}`);

  return `RRULE:${parts.join(';')}`;
};
