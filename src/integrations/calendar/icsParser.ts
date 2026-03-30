import type { NormalizedEvent } from '../../domain/calendar';

type ParsedLine = {
  name: string;
  params: Record<string, string>;
  value: string;
};

type ParsedDate = {
  iso: string;
  allDay: boolean;
};

const parseIcsValueLine = (line: string): ParsedLine => {
  const separatorIndex = line.indexOf(':');
  const left = separatorIndex >= 0 ? line.slice(0, separatorIndex) : line;
  const value = separatorIndex >= 0 ? line.slice(separatorIndex + 1) : '';
  const [name, ...params] = left.split(';');
  return {
    name: name.toUpperCase(),
    params: Object.fromEntries(
      params.map((part) => {
        const [key, rawValue = ''] = part.split('=');
        return [key.toUpperCase(), rawValue.toUpperCase()];
      })
    ),
    value
  };
};

const parseIcsDate = (value: string, params: Record<string, string>): ParsedDate => {
  const isAllDay = params.VALUE === 'DATE' || /^\d{8}$/.test(value);
  if (isAllDay) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6));
    const day = Number(value.slice(6, 8));
    return { iso: new Date(year, month - 1, day, 12, 0, 0).toISOString(), allDay: true };
  }

  const raw = value.endsWith('Z') ? value.slice(0, -1) : value;
  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(4, 6));
  const day = Number(raw.slice(6, 8));
  const hour = Number(raw.slice(9, 11));
  const minute = Number(raw.slice(11, 13));
  const second = Number(raw.slice(13, 15) || '0');
  const date = value.endsWith('Z')
    ? new Date(Date.UTC(year, month - 1, day, hour, minute, second))
    : new Date(year, month - 1, day, hour, minute, second);
  return { iso: date.toISOString(), allDay: false };
};

export const parseIcsText = (content: string, calendarId: string, timeMin: string, timeMax: string): NormalizedEvent[] => {
  const timeMinMs = new Date(timeMin).getTime();
  const timeMaxMs = new Date(timeMax).getTime();
  const unfolded = content.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);
  const events: NormalizedEvent[] = [];

  let current: {
    uid?: string;
    summary?: string;
    description?: string;
    location?: string;
    start?: ParsedDate;
    end?: ParsedDate;
    url?: string;
  } | null = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }

    if (line === 'END:VEVENT') {
      if (current?.start) {
        const startMs = new Date(current.start.iso).getTime();
        if (startMs >= timeMinMs && startMs <= timeMaxMs) {
          events.push({
            id: current.uid ?? `${calendarId}-${events.length + 1}`,
            provider: 'ics',
            calendarId,
            title: current.summary ?? 'Untitled event',
            description: current.description,
            location: current.location,
            start: current.start,
            end: current.end ?? current.start,
            url: current.url,
            source: 'external'
          });
        }
      }
      current = null;
      continue;
    }

    if (!current || !line || line.startsWith('BEGIN:') || line.startsWith('END:')) continue;

    const parsed = parseIcsValueLine(line);
    if (parsed.name === 'SUMMARY') current.summary = parsed.value;
    if (parsed.name === 'DESCRIPTION') current.description = parsed.value.replace(/\\n/g, '\n');
    if (parsed.name === 'LOCATION') current.location = parsed.value;
    if (parsed.name === 'UID') current.uid = parsed.value;
    if (parsed.name === 'URL') current.url = parsed.value;
    if (parsed.name === 'DTSTART') current.start = parseIcsDate(parsed.value, parsed.params);
    if (parsed.name === 'DTEND') current.end = parseIcsDate(parsed.value, parsed.params);
  }

  return events;
};
