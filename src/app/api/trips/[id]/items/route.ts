import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, zodErrorResponse } from "@/lib/api-utils";
import { isTrustedMutationRequest } from "@/lib/security/mutation-origin";
import { parseJsonBodyWithLimit } from "@/lib/http/bounded-body";
import { resolveOwnerContext } from "@/lib/auth/owner-context";
import { checkRateLimit, clientKeyFromRequest } from "@/lib/rate-limit";
import { addPlaceToTrip, type TripActionError } from "@/lib/trips/actions";

// "Add to my trip" from Explore, the map card or a community post lands here.
// Before this existed, a traveller could find a place and had no way to put it
// into their plan except by describing it to the keyword editor.

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  placeId: z.string().uuid(),
  dayIndex: z.number().int().min(0).max(364).optional(),
});

const STATUS: Record<TripActionError, number> = {
  trip_not_found: 404,
  forbidden: 403,
  day_not_found: 422,
  place_not_found: 404,
  item_not_found: 404,
  item_booked: 409,
  invalid_dates: 422,
  trip_too_long: 422,
};

const MESSAGE: Record<TripActionError, string> = {
  trip_not_found: "Trip not found.",
  forbidden: "You don't have permission to edit this trip.",
  day_not_found: "That day is not part of this trip.",
  place_not_found: "Place not found.",
  item_not_found: "Itinerary item not found.",
  invalid_dates: "The end date must be on or after the start date.",
  trip_too_long: "A trip can span at most 365 days.",
  item_booked: "This item is linked to a booking and cannot be changed.",
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isTrustedMutationRequest(request)) return jsonError("Request origin is not allowed.", 403);

  const owner = await resolveOwnerContext();
  const actorId = owner.userId ?? owner.guestId ?? "anonymous";
  const rate = await checkRateLimit(clientKeyFromRequest(request, "trip-items:" + actorId), 120, 60 * 60 * 1000);
  if (!rate.allowed) return jsonError("Too many itinerary changes. Please slow down.", 429);

  const json = await parseJsonBodyWithLimit(request);
  if (!json.ok) return jsonError("Request body is too large.", 413);
  const parsed = bodySchema.safeParse(json.body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const { id } = await context.params;
  const result = await addPlaceToTrip({
    tripId: id,
    placeId: parsed.data.placeId,
    dayIndex: parsed.data.dayIndex,
    owner,
  });

  if (!result.ok) return jsonError(MESSAGE[result.error], STATUS[result.error]);
  return NextResponse.json({ item: result.data }, { status: 201 });
}
