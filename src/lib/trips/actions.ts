import "server-only";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { itineraryItems, places, tripDays, trips } from "@/db/schema";
import { loadOwnedTrip } from "./ownership";
import type { OwnerContext } from "@/lib/auth/owner-context";

// The single guarded place where a trip's contents change.
//
// Explore, the map card, the trip screen and Sindbad AI all funnel through
// these functions, so ownership, "is this place real", and "is this item
// already booked" are enforced once rather than re-implemented per caller.
// This is what keeps the app one trip rather than several disconnected views
// of one.

export type TripActionError =
  | "trip_not_found"
  | "forbidden"
  | "day_not_found"
  | "place_not_found"
  | "item_not_found"
  | "item_booked";

export type TripActionResult<T> = { ok: true; data: T } | { ok: false; error: TripActionError };

function fail(error: TripActionError): { ok: false; error: TripActionError } {
  return { ok: false, error };
}

export interface ItineraryItemView {
  id: string;
  tripId: string;
  tripDayId: string;
  dayIndex: number;
  date: string;
  title: string;
  category: string;
  placeId: string | null;
  estimatedCost: string | null;
  currency: string;
  status: string;
  sortOrder: number;
}

async function viewOf(itemId: string): Promise<ItineraryItemView | null> {
  const [row] = await db
    .select({
      id: itineraryItems.id,
      tripId: tripDays.tripId,
      tripDayId: itineraryItems.tripDayId,
      dayIndex: tripDays.dayIndex,
      date: tripDays.date,
      title: itineraryItems.title,
      category: itineraryItems.category,
      placeId: itineraryItems.placeId,
      estimatedCost: itineraryItems.estimatedCost,
      currency: itineraryItems.currency,
      status: itineraryItems.status,
      sortOrder: itineraryItems.sortOrder,
    })
    .from(itineraryItems)
    .innerJoin(tripDays, eq(itineraryItems.tripDayId, tripDays.id))
    .where(eq(itineraryItems.id, itemId))
    .limit(1);
  return row ?? null;
}

/**
 * Add an approved place to a specific day of a trip.
 *
 * No price is invented here. The place table has no per-visit cost, so the
 * item is stored without an estimate and the budget view reports it as
 * "not estimated" rather than as zero, which would silently understate the
 * trip total.
 */
export async function addPlaceToTrip(input: {
  tripId: string;
  placeId: string;
  dayIndex?: number;
  owner: OwnerContext;
}): Promise<TripActionResult<ItineraryItemView>> {
  const { trip, allowed } = await loadOwnedTrip(input.tripId, input.owner);
  if (!trip) return fail("trip_not_found");
  if (!allowed) return fail("forbidden");

  const [place] = await db
    .select({ id: places.id, name: places.name })
    .from(places)
    .where(and(eq(places.id, input.placeId), eq(places.status, "approved")))
    .limit(1);
  if (!place) return fail("place_not_found");

  const days = await db
    .select()
    .from(tripDays)
    .where(eq(tripDays.tripId, input.tripId))
    .orderBy(asc(tripDays.dayIndex));
  if (days.length === 0) return fail("day_not_found");

  // No day given means "wherever it fits": the first day keeps the action one
  // tap for a traveller who has not thought about scheduling yet.
  const day = input.dayIndex === undefined ? days[0] : days.find((d) => d.dayIndex === input.dayIndex);
  if (!day) return fail("day_not_found");

  const inserted = await db.transaction(async (tx) => {
    const existing = await tx
      .select({ sortOrder: itineraryItems.sortOrder })
      .from(itineraryItems)
      .where(eq(itineraryItems.tripDayId, day.id));
    const nextOrder = existing.reduce((highest, row) => Math.max(highest, row.sortOrder), -1) + 1;

    const [row] = await tx
      .insert(itineraryItems)
      .values({
        tripDayId: day.id,
        placeId: place.id,
        title: place.name,
        category: "activity",
        currency: trip.budgetCurrency,
        status: "confirmed",
        sortOrder: nextOrder,
      })
      .returning({ id: itineraryItems.id });
    return row;
  });

  const view = await viewOf(inserted.id);
  return view ? { ok: true, data: view } : fail("item_not_found");
}

/** Remove an item the traveller owns. A booked item is never silently dropped. */
export async function removeItineraryItem(input: {
  itemId: string;
  owner: OwnerContext;
}): Promise<TripActionResult<{ removedId: string; tripId: string }>> {
  const view = await viewOf(input.itemId);
  if (!view) return fail("item_not_found");

  const { trip, allowed } = await loadOwnedTrip(view.tripId, input.owner);
  if (!trip) return fail("trip_not_found");
  if (!allowed) return fail("forbidden");

  const [existing] = await db
    .select({ bookingId: itineraryItems.bookingId })
    .from(itineraryItems)
    .where(eq(itineraryItems.id, input.itemId))
    .limit(1);
  if (existing && existing.bookingId) return fail("item_booked");

  // The bookingId guard is repeated in the WHERE clause so a booking created
  // between the check and the delete cannot lose its itinerary link.
  await db.delete(itineraryItems).where(and(eq(itineraryItems.id, input.itemId), isNull(itineraryItems.bookingId)));

  return { ok: true, data: { removedId: input.itemId, tripId: view.tripId } };
}

/** Move an item to another day of the same trip. */
export async function moveItineraryItem(input: {
  itemId: string;
  toDayIndex: number;
  owner: OwnerContext;
}): Promise<TripActionResult<ItineraryItemView>> {
  const view = await viewOf(input.itemId);
  if (!view) return fail("item_not_found");

  const { trip, allowed } = await loadOwnedTrip(view.tripId, input.owner);
  if (!trip) return fail("trip_not_found");
  if (!allowed) return fail("forbidden");

  const [day] = await db
    .select()
    .from(tripDays)
    .where(and(eq(tripDays.tripId, view.tripId), eq(tripDays.dayIndex, input.toDayIndex)))
    .limit(1);
  if (!day) return fail("day_not_found");

  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ sortOrder: itineraryItems.sortOrder })
      .from(itineraryItems)
      .where(eq(itineraryItems.tripDayId, day.id));
    const nextOrder = existing.reduce((highest, row) => Math.max(highest, row.sortOrder), -1) + 1;

    await tx
      .update(itineraryItems)
      .set({ tripDayId: day.id, sortOrder: nextOrder })
      .where(eq(itineraryItems.id, input.itemId));
  });

  const updated = await viewOf(input.itemId);
  return updated ? { ok: true, data: updated } : fail("item_not_found");
}

export interface TripBudgetSummary {
  currency: string;
  budgetAmount: number | null;
  estimatedTotal: number;
  /** Items that carry a cost estimate. */
  estimatedItems: number;
  /** Items with no estimate: counted, never silently treated as free. */
  unestimatedItems: number;
  remaining: number | null;
  overBudget: boolean;
}

/**
 * What the trip is expected to cost, derived from the itinerary itself.
 *
 * Items without an estimate are reported separately instead of being summed
 * as zero, so the screen can say "plus N activities not yet priced" rather
 * than implying the plan is cheaper than it is.
 */
export async function summarizeTripBudget(tripId: string): Promise<TripBudgetSummary | null> {
  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
  if (!trip) return null;

  const days = await db.select({ id: tripDays.id }).from(tripDays).where(eq(tripDays.tripId, tripId));
  const dayIds = days.map((day) => day.id);

  const items = dayIds.length
    ? await db
        .select({ estimatedCost: itineraryItems.estimatedCost })
        .from(itineraryItems)
        .where(inArray(itineraryItems.tripDayId, dayIds))
    : [];

  let estimatedTotal = 0;
  let estimatedItems = 0;
  let unestimatedItems = 0;
  for (const item of items) {
    const value = item.estimatedCost === null ? null : Number(item.estimatedCost);
    if (value === null || !Number.isFinite(value)) {
      unestimatedItems += 1;
      continue;
    }
    estimatedTotal += value;
    estimatedItems += 1;
  }

  const budgetAmount = trip.budgetAmount === null ? null : Number(trip.budgetAmount);
  const hasBudget = budgetAmount !== null && Number.isFinite(budgetAmount);

  return {
    currency: trip.budgetCurrency,
    budgetAmount: hasBudget ? budgetAmount : null,
    estimatedTotal: Math.round(estimatedTotal * 100) / 100,
    estimatedItems,
    unestimatedItems,
    remaining: hasBudget ? Math.round((budgetAmount - estimatedTotal) * 100) / 100 : null,
    overBudget: hasBudget ? estimatedTotal > budgetAmount : false,
  };
}
