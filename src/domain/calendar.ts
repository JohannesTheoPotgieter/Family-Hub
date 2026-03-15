export type Provider = 'google' | 'microsoft' | 'caldav' | 'ics';

export type NormalizedCalendar = {
  id: string;
  provider: Provider;
  name: string;
  primary?: boolean;
  color?: string;
  readOnly?: boolean;
  accountLabel?: string;
};

export type NormalizedEvent = {
  id: string;
  provider: Provider;
  calendarId: string;
  title: string;
  description?: string;
  location?: string;
  start: { iso: string; allDay: boolean };
  end: { iso: string; allDay: boolean };
  organizer?: string;
  url?: string;
  updatedAtIso?: string;
  source?: 'external' | 'internal';
};

export const toDedupeKey = (event: Pick<NormalizedEvent, 'provider' | 'calendarId' | 'id'>) =>
  `${event.provider}:${event.calendarId}:${event.id}`;

export const normalizeDateTime = (value: string | Date) => new Date(value).toISOString();

const localNoonFromDateOnly = (dateOnly: string) => {
  const [y, m, d] = dateOnly.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0).toISOString();
};

export const normalizeAllDayRange = (startDate: string, endDate?: string) => ({
  start: { iso: localNoonFromDateOnly(startDate), allDay: true },
  end: { iso: localNoonFromDateOnly(endDate ?? startDate), allDay: true }
});

export const normalizeGoogleEvent = (event: any, calendarId: string): NormalizedEvent => {
  const isAllDay = Boolean(event.start?.date);
  const allDay = isAllDay ? normalizeAllDayRange(event.start.date, event.end?.date) : undefined;

  return {
    id: event.id,
    provider: 'google',
    calendarId,
    title: event.summary ?? 'Untitled event',
    description: event.description,
    location: event.location,
    start: isAllDay ? allDay!.start : { iso: normalizeDateTime(event.start?.dateTime), allDay: false },
    end: isAllDay ? allDay!.end : { iso: normalizeDateTime(event.end?.dateTime ?? event.start?.dateTime), allDay: false },
    organizer: event.organizer?.email,
    url: event.htmlLink,
    updatedAtIso: event.updated,
    source: 'external'
  };
};

export const normalizeMicrosoftEvent = (event: any, calendarId: string): NormalizedEvent => {
  const isAllDay = Boolean(event.isAllDay);
  const startValue = event.start?.dateTime ?? event.start?.date;
  const endValue = event.end?.dateTime ?? event.end?.date ?? startValue;

  return {
    id: event.id,
    provider: 'microsoft',
    calendarId,
    title: event.subject ?? 'Untitled event',
    description: event.bodyPreview,
    location: event.location?.displayName,
    start: isAllDay ? normalizeAllDayRange(startValue.slice(0, 10)).start : { iso: normalizeDateTime(startValue), allDay: false },
    end: isAllDay ? normalizeAllDayRange(endValue.slice(0, 10)).end : { iso: normalizeDateTime(endValue), allDay: false },
    organizer: event.organizer?.emailAddress?.address,
    url: event.webLink,
    updatedAtIso: event.lastModifiedDateTime,
    source: 'external'
  };
};
