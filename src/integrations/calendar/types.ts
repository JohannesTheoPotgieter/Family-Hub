import type { NormalizedCalendar, NormalizedEvent, Provider } from '../../domain/calendar';

export type CalendarConnectInput = {
  accessToken?: string;
  name?: string;
  url?: string;
};

export interface CalendarProviderClient {
  provider: Provider;
  label: string;
  isAvailable(): boolean;
  connect(input?: CalendarConnectInput): Promise<void>;
  disconnect(calendarId?: string): Promise<void>;
  listCalendars(): Promise<NormalizedCalendar[]>;
  listEvents(params: { calendarId: string; timeMinIso: string; timeMaxIso: string }): Promise<NormalizedEvent[]>;
}
