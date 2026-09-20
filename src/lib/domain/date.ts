/**
 * Parse a calendar date without allowing JavaScript Date to silently normalize
 * impossible values (for example 2026-02-31 -> March).
 */
export function parseIsoDateStrict(value?: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;

  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
}

export function isValidIsoDate(value: string): boolean {
  return parseIsoDateStrict(value) !== null;
}

/** Returns whole calendar-day difference (end - start), or null for invalid input. */
export function isoDateDifferenceDays(startDate?: string | null, endDate?: string | null): number | null {
  const start = parseIsoDateStrict(startDate);
  const end = parseIsoDateStrict(endDate);
  if (!start || !end) return null;
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}
