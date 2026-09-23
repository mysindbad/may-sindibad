export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function formatCurrency(amount: number | string, currency: string, locale = "en-US"): string {
  const value = typeof amount === "string" ? Number(amount) : amount;
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}

const RELATIVE_TIME_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["week", 60 * 60 * 24 * 7],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60],
];

/** "3 hours ago" / "قبل 3 ساعات" - Intl.RelativeTimeFormat carries each
 * locale's own plural rules (Arabic alone has six), so this never hand-rolls
 * that grammar the way a dict string built from a template would have to. */
export function formatRelativeTime(value: string | Date, locale = "en-US"): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  for (const [unit, secondsInUnit] of RELATIVE_TIME_UNITS) {
    if (Math.abs(diffSeconds) >= secondsInUnit) {
      return formatter.format(Math.round(diffSeconds / secondsInUnit), unit);
    }
  }
  return formatter.format(diffSeconds, "second");
}

export function formatDateRange(startDate: string, endDate: string, locale = "en-US"): string {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const formatter = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" });
  if (startDate === endDate) return formatter.format(start);
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}

export function nightsBetween(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00`).getTime();
  const end = new Date(`${endDate}T00:00:00`).getTime();
  return Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)));
}

export function isValidHexColor(value: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);
}
