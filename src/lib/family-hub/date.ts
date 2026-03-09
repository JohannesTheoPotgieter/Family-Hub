export const getTodayIso = () => new Date().toISOString().slice(0, 10);

export const isSameDay = (a: string, b: string) => a === b;
