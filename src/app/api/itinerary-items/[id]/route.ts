import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { itineraryItems, places, tripDays } from "@/db/schema";
import { getOwnerContext } from "@/lib/auth/owner-context";
import { loadOwnedTrip } from "@/lib/trips/ownership";
import { itineraryItemUpdateSchema } from "@/lib/validation";
import { jsonError, zodErrorResponse } from "@/lib/api-utils";
import { isTrustedMutationRequest } from "@/lib/security/mutation-origin";
import { parseJsonBodyWithLimit } from "@/lib/http/bounded-body";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isTrustedMutationRequest(request)) return jsonError("Request origin is not allowed.", 403);
  const { id } = await context.params;

  const [item] = await db.select().from(itineraryItems).where(eq(itineraryItems.id, id)).limit(1);
  if (!item) return jsonError("Activity not found.", 404);

  const [day] = await db.select().from(tripDays).where(eq(tripDays.id, item.tripDayId)).limit(1);
  if (!day) return jsonError("Trip day not found.", 404);

  const owner = await getOwnerContext();
  const { trip, allowed } = await loadOwnedTrip(day.tripId, owner);
  if (!trip || !allowed) return jsonError("You don't have permission to edit this itinerary.", 403);

  const json = await parseJsonBodyWithLimit(request);
  if (!json.ok) return jsonError("Request body is too large.", 413);
  const body = json.body;
  const parsed = itineraryItemUpdateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  if (parsed.data.status === "booked") {
    return jsonError("Booked status is controlled by a confirmed booking and cannot be set manually.", 422);
  }

  const protectedFields = ["title", "startTime", "endTime", "status", "placeId", "estimatedCost"] as const;
  const modifiesBookingProtectedField = protectedFields.some((field) => parsed.data[field] !== undefined);
  if (item.bookingId && modifiesBookingProtectedField) {
    return jsonError("This itinerary item is linked to a booking. Cancel or change the booking before changing the activity.", 409);
  }

  if (parsed.data.placeId) {
    const [place] = await db
      .select({ id: places.id })
      .from(places)
      .where(and(eq(places.id, parsed.data.placeId), eq(places.status, "approved")))
      .limit(1);
    if (!place) return jsonError("Selected place is not available.", 422);
  }

  const { estimatedCost, ...rest } = parsed.data;

  const [updated] = await db
    .update(itineraryItems)
    .set({ ...rest, estimatedCost: estimatedCost !== undefined ? estimatedCost?.toString() ?? null : undefined })
    .where(
      modifiesBookingProtectedField
        ? and(eq(itineraryItems.id, id), isNull(itineraryItems.bookingId))
        : eq(itineraryItems.id, id),
    )
    .returning();

  if (!updated) {
    return jsonError("This activity changed while you were editing it. Refresh and try again.", 409);
  }
  return NextResponse.json({ item: updated });
}
