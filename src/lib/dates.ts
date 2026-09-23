// Monday–Sunday of the current week, as YYYY-MM-DD strings (local calendar
// date — deliberately not toISOString(), which converts to UTC and can
// shift the date by a day in timezones ahead of UTC, e.g. British Summer Time).
const toLocalDateString = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function getCurrentWeekDates(reference = new Date()): string[] {
  const day = reference.getDay(); // 0 = Sunday
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(reference);
  monday.setDate(reference.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return toLocalDateString(d);
  });
}

// A rolling window starting today, not aligned to the calendar week — e.g.
// for the Timesheets page's "what's coming up" rota preview.
export function getNextNDays(days: number, reference = new Date()): string[] {
  const start = new Date(reference);
  start.setHours(0, 0, 0, 0);

  return Array.from({ length: days }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return toLocalDateString(d);
  });
}
