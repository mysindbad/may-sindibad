import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { trips } from "@/db/schema";
import type { OwnerContext } from "@/lib/auth/owner-context";

export async function loadOwnedTrip(tripId: string, owner: OwnerContext) {
  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
  if (!trip) return { trip: null, allowed: false } as const;

  const allowed = owner.userId ? trip.userId === owner.userId : Boolean(owner.guestId) && trip.guestId === owner.guestId && trip.userId === null;

  return { trip, allowed } as const;
}
