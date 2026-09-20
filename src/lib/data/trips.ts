import "server-only";
import { and, asc, eq, gte, isNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { trips } from "@/db/schema";
import type { OwnerContext } from "@/lib/auth/owner-context";

export async function getTripsForOwner(owner: OwnerContext) {
  const ownerFilter = owner.userId ? eq(trips.userId, owner.userId) : owner.guestId ? and(isNull(trips.userId), eq(trips.guestId, owner.guestId)) : undefined;
  if (!ownerFilter) return [];
  return db.select().from(trips).where(ownerFilter).orderBy(trips.createdAt);
}

/**
 * Returns an active trip first, otherwise the nearest planned trip that has
 * not already ended. Passing the request-local date avoids stale past trips
 * appearing as the user's current travel context.
 */
export async function getRelevantTrip(owner: OwnerContext, today: string) {
  const ownerFilter = owner.userId ? eq(trips.userId, owner.userId) : owner.guestId ? and(isNull(trips.userId), eq(trips.guestId, owner.guestId)) : undefined;
  if (!ownerFilter) return null;

  const [active] = await db
    .select()
    .from(trips)
    .where(and(ownerFilter, eq(trips.status, "active"), lte(trips.startDate, today), gte(trips.endDate, today)))
    .orderBy(asc(trips.startDate))
    .limit(1);
  if (active) return active;

  const [planned] = await db
    .select()
    .from(trips)
    .where(and(ownerFilter, eq(trips.status, "planned"), gte(trips.endDate, today)))
    .orderBy(asc(trips.startDate))
    .limit(1);

  return planned ?? null;
}
