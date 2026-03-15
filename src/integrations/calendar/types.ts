import type { NormalizedCalendar, NormalizedEvent, Provider } from '../../domain/calendar';

export interface CalendarProviderClient {
  provider: Provider;
  isAvailable(): boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  listCalendars(): Promise<NormalizedCalendar[]>;
  listEvents(params: { calendarId: string; timeMinIso: string; timeMaxIso: string }): Promise<NormalizedEvent[]>;
}
