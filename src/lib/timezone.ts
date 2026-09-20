import "server-only";
import { cookies } from "next/headers";
import { normalizeTimeZoneCookie } from "@/lib/timezone-value";

const COOKIE_NAME = "sindbad_tz";

export async function getRequestTimeZone(): Promise<string | undefined> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  return normalizeTimeZoneCookie(raw);
}

export function dateKeyInTimeZone(date: Date, timeZone?: string): string {
  if (!timeZone) return date.toISOString().slice(0, 10);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function minutesInTimeZone(date: Date, timeZone?: string): number {
  if (!timeZone) return date.getHours() * 60 + date.getMinutes();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}
