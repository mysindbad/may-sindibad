import { NextResponse } from "next/server";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookings, tripDays, itineraryItems, trips } from "@/db/schema";
import { getOwnerContext } from "@/lib/auth/owner-context";
import { loadOwnedTrip } from "@/lib/trips/ownership";
import { tripUpdateSchema } from "@/lib/validation";
import { jsonError, zodErrorResponse } from "@/lib/api-utils";
import { isTrustedMutationRequest } from "@/lib/security/mutation-origin";
import { parseJsonBodyWithLimit } from "@/lib/http/bounded-body";
import { toClientTripView } from "@/lib/trips/client-view";

export const dynamic = "force-dynamic";

class ActiveTripBookingError extends Error {
  constructor() {
    super("ACTIVE_TRIP_BOOKING");
    this.name = "ActiveTripBookingError";
  }
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const owner = await getOwnerContext();
  const { trip, allowed } = await loadOwnedTrip(id, owner);
  if (!trip) return jsonError("Trip not found.", 404);
  if (!allowed) return jsonError("You don't have permission to view this trip.", 403);

  const days = await db.select().from(tripDays).where(eq(tripDays.tripId, id)).orderBy(asc(tripDays.dayIndex));
  const dayIds = days.map((d) => d.id);
  const items = dayIds.length
    ? await db.select().from(itineraryItems).where(inArray(itineraryItems.tripDayId, dayIds)).orderBy(asc(itineraryItems.sortOrder))
    : [];

  return NextResponse.json({
    trip: toClientTripView(trip),
    days: days.map((day) => ({ ...day, items: items.filter((item) => item.tripDayId === day.id) })),
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isTrustedMutationRequest(request)) return jsonError("Request origin is not allowed.", 403);
  const { id } = await context.params;
  const owner = await getOwnerContext();
  const { trip, allowed } = await loadOwnedTrip(id, owner);
  if (!trip) return jsonError("Trip not found.", 404);
  if (!allowed) return jsonError("You don't have permission to edit this trip.", 403);

  const json = await parseJsonBodyWithLimit(request);
  if (!json.ok) return jsonError("Request body is too large.", 413);
  const body = json.body;
  const parsed = tripUpdateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  if (
    (parsed.data.startDate !== undefined && parsed.data.startDate !== trip.startDate) ||
    (parsed.data.endDate !== undefined && parsed.data.endDate !== trip.endDate)
  ) {
    return jsonError("Trip date changes require a dedicated reschedule flow so itinerary days are not corrupted.", 409);
  }

  if (
    (parsed.data.destinationCity !== undefined && parsed.data.destinationCity !== trip.destinationCity) ||
    (parsed.data.destinationCountry !== undefined && parsed.data.destinationCountry !== trip.destinationCountry)
  ) {
    return jsonError("Trip destination changes require a dedicated replan flow so the itinerary is not left in the previous destination.", 409);
  }

  if (parsed.data.status !== undefined && parsed.data.status !== trip.status) {
    return jsonError("Trip status changes require a dedicated lifecycle action so bookings and travel state stay consistent.", 409);
  }

  const {
    generateItinerary: _ignored,
    budgetAmount,
    startDate: _startDate,
    endDate: _endDate,
    destinationCity: _destinationCity,
    destinationCountry: _destinationCountry,
    status: _status,
    ...rest
  } = parsed.data;
  void _ignored;
  void _startDate;
  void _endDate;
  void _destinationCity;
  void _destinationCountry;
  void _status;

  const [updated] = await db
    .update(trips)
    .set({ ...rest, budgetAmount: budgetAmount?.toString(), updatedAt: new Date() })
    .where(eq(trips.id, id))
    .returning();

  return NextResponse.json({ trip: toClientTripView(updated) });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isTrustedMutationRequest(request)) return jsonError("Request origin is not allowed.", 403);
  const { id } = await context.params;
  const owner = await getOwnerContext();
  const { trip, allowed } = await loadOwnedTrip(id, owner);
  if (!trip) return jsonError("Trip not found.", 404);
  if (!allowed) return jsonError("You don't have permission to delete this trip.", 403);

  try {
    await db.transaction(async (tx) => {
      // Lock every itinerary item in this trip before checking active bookings.
      // A concurrent booking insert needs to validate its FK against the same
      // item, so this prevents a trip delete from racing a newly linked booking
      // into an ownerless operational state.
      await tx.execute(sql`
        select ii.id
        from itinerary_items ii
        inner join trip_days td on td.id = ii.trip_day_id
        where td.trip_id = ${id}
        for update of ii
      `);

      const [activeBooking] = await tx
        .select({ id: bookings.id })
        .from(bookings)
        .innerJoin(itineraryItems, eq(bookings.itineraryItemId, itineraryItems.id))
        .innerJoin(tripDays, eq(itineraryItems.tripDayId, tripDays.id))
        .where(
          and(
            eq(tripDays.tripId, id),
            inArray(bookings.status, ["draft", "pending", "awaiting_payment", "confirmed"]),
          ),
        )
        .limit(1);

      if (activeBooking) throw new ActiveTripBookingError();
      await tx.delete(trips).where(eq(trips.id, id));
    });
  } catch (error) {
    if (error instanceof ActiveTripBookingError) {
      return jsonError("This trip has an active booking. Manage or cancel the booking before deleting the trip.", 409);
    }
    throw error;
  }

  return NextResponse.json({ ok: true });
}
