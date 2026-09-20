/**
 * Normalize a browser-provided IANA time-zone cookie defensively.
 * Cookie values are untrusted input: malformed percent-encoding must never
 * turn a normal page render into a server exception.
 */
export function normalizeTimeZoneCookie(raw: string | null | undefined): string | undefined {
  if (!raw || raw.length > 160) return undefined;

  try {
    const value = decodeURIComponent(raw);
    if (!value || value.length > 120) return undefined;
    new Intl.DateTimeFormat("en", { timeZone: value }).format(new Date());
    return value;
  } catch {
    return undefined;
  }
}
