import "server-only";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "@/db";
import { trips, aiConversations, bookings } from "@/db/schema";

/**
 * Re-attaches guest-owned data to the authenticated account atomically.
 * Only rows that still have no user and match this opaque guest cookie are
 * claimed, so one login can never overwrite another account's ownership.
 */
export async function migrateGuestDataToUser(userId: string, guestId: string): Promise<{ trips: number; conversations: number; bookings: number }> {
  return db.transaction(async (tx) => {
    const tripRows = await tx
      .update(trips)
      .set({ userId, guestId: null })
      .where(and(isNull(trips.userId), eq(trips.guestId, guestId)))
      .returning({ id: trips.id });

    const conversationRows = await tx
      .update(aiConversations)
      .set({ userId, guestId: null })
      .where(and(isNull(aiConversations.userId), eq(aiConversations.guestId, guestId)))
      .returning({ id: aiConversations.id });

    // Guest bookings are not created by the current product, but retaining
    // this migration keeps older development data safe during upgrades.
    const bookingRows = await tx
      .update(bookings)
      .set({ userId, guestId: null })
      .where(and(isNull(bookings.userId), eq(bookings.guestId, guestId)))
      .returning({ id: bookings.id });

    return { trips: tripRows.length, conversations: conversationRows.length, bookings: bookingRows.length };
  });
}
