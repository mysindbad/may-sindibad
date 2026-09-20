// Server-side helper for time-aware travel context. It prefers the user's
// browser-reported IANA time zone (synced through a non-sensitive cookie) and
// falls back to the server clock only when no validated zone is available.
export type DayPart = "morning" | "afternoon" | "evening" | "night";

export function dayPartForHour(hour: number): DayPart {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

export function currentDayPart(timeZone?: string): DayPart {
  const now = new Date();
  if (!timeZone) return dayPartForHour(now.getHours());
  try {
    const hourPart = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .find((part) => part.type === "hour")?.value;
    return dayPartForHour(Number(hourPart ?? now.getHours()));
  } catch {
    return dayPartForHour(now.getHours());
  }
}
