import "server-only";
import { getCurrentUser } from "./session";
import { getGuestId, getOrCreateGuestId } from "./guest";

export interface OwnerContext {
  userId: string | null;
  guestId: string | null;
}

/**
 * Read-only identity lookup. Safe in Server Components because it never
 * writes cookies. Guests who have not created any guest-owned data simply
 * resolve to a null owner.
 */
export async function getOwnerContext(): Promise<OwnerContext> {
  const user = await getCurrentUser();
  if (user) return { userId: user.id, guestId: null };
  return { userId: null, guestId: await getGuestId() };
}

/**
 * Mutation identity lookup for guest-capable write endpoints. Creates the
 * opaque guest cookie only when a guest actually performs a persisted action.
 */
export async function resolveOwnerContext(): Promise<OwnerContext> {
  const user = await getCurrentUser();
  if (user) return { userId: user.id, guestId: null };
  const guestId = await getOrCreateGuestId();
  return { userId: null, guestId };
}
