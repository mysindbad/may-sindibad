import "server-only";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { isValidGuestId } from "./guest-id";

export const GUEST_COOKIE = "sindbad_guest";
const GUEST_TTL_SECONDS = 60 * 60 * 24 * 365;

/** Returns the existing guest id from cookies, or null if none exists yet. */
export async function getGuestId(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(GUEST_COOKIE)?.value;
  return isValidGuestId(value) ? value : null;
}

/** Returns the existing guest id, creating and persisting a new one if needed. */
export async function getOrCreateGuestId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(GUEST_COOKIE)?.value;
  if (isValidGuestId(existing)) return existing;

  const guestId = `guest_${randomUUID()}`;
  store.set(GUEST_COOKIE, guestId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: GUEST_TTL_SECONDS,
  });
  return guestId;
}

export async function clearGuestId() {
  const store = await cookies();
  store.delete(GUEST_COOKIE);
}
