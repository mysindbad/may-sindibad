import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { itineraryItems, tripDays, trips } from "@/db/schema";

export async function userOwnsItineraryItem(userId: string, itineraryItemId: string): Promise<boolean> {
  const [row] = await db
    .select({ tripUserId: trips.userId })
    .from(itineraryItems)
    .innerJoin(tripDays, eq(itineraryItems.tripDayId, tripDays.id))
    .innerJoin(trips, eq(tripDays.tripId, trips.id))
    .where(eq(itineraryItems.id, itineraryItemId))
    .limit(1);

  return row?.tripUserId === userId;
}
