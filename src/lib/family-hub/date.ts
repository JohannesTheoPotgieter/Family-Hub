// Format a Date's LOCAL calendar day as YYYY-MM-DD. Date-only strings in
// app state are local dates; `toISOString().slice(0, 10)` silently shifts
// them by a day for any user east of UTC, so all date-key serialization
// must go through here.
export const toLocalDateIso = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

// Parse a YYYY-MM-DD string as LOCAL midnight. `new Date('YYYY-MM-DD')`
// parses as UTC midnight, which is the previous local day west of UTC.
export const parseLocalDateIso = (dateIso: string) => {
  const [year, month, day] = dateIso.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
};

export const getTodayIso = () => toLocalDateIso(new Date());

export const isSameDay = (a: string, b: string) => a === b;
