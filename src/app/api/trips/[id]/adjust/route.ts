import { NextResponse } from "next/server";
import { asc, eq, and, ilike, inArray, notInArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { itineraryItems, places, placeCategories, tripDays } from "@/db/schema";
import { getOwnerContext } from "@/lib/auth/owner-context";
import { loadOwnedTrip } from "@/lib/trips/ownership";
import { jsonError, zodErrorResponse } from "@/lib/api-utils";
import { isTrustedMutationRequest } from "@/lib/security/mutation-origin";
import { parseJsonBodyWithLimit } from "@/lib/http/bounded-body";
import { z } from "zod";

// A deterministic (non-AI) conversational-editing endpoint. It recognises a
// small set of concrete travel-planning intents so the itinerary-editing UX
// works honestly today, without an AI provider pretending to "understand"
// arbitrary free text. When an AI provider is configured elsewhere in the
// product (Sindbad AI chat), this remains the safe, auditable execution
// layer that real tool-calling can be wired into later.
const bodySchema = z.object({ message: z.string().trim().min(2).max(300) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isTrustedMutationRequest(request)) return jsonError("Request origin is not allowed.", 403);
  const { id } = await context.params;
  const owner = await getOwnerContext();
  const { trip, allowed } = await loadOwnedTrip(id, owner);
  if (!trip) return jsonError("Trip not found.", 404);
  if (!allowed) return jsonError("You don't have permission to edit this trip.", 403);

  const json = await parseJsonBodyWithLimit(request);
  if (!json.ok) return jsonError("Request body is too large.", 413);
  const body = json.body;
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const message = parsed.data.message.toLowerCase();
  const days = await db.select().from(tripDays).where(eq(tripDays.tripId, id)).orderBy(asc(tripDays.dayIndex));
  if (days.length === 0) return jsonError("This trip has no days yet.", 422);

  if (message.includes("cheap")) {
    await db.transaction(async (tx) => {
      const items = await tx
        .select()
        .from(itineraryItems)
        .where(and(eq(itineraryItems.tripDayId, days[0].id), isNull(itineraryItems.bookingId)));

      for (const item of items) {
        const current = Number(item.estimatedCost ?? 0);
        await tx
          .update(itineraryItems)
          .set({ estimatedCost: Math.round(current * 0.7).toString() })
          .where(and(eq(itineraryItems.id, item.id), isNull(itineraryItems.bookingId)));
      }
    });
    return NextResponse.json({ applied: "reduced_costs_day_1", message: "Reduced estimated costs for day 1 by ~30%." });
  }

  const additionKeywords: Array<{ keyword: string; categorySlug: string; label: string }> = [
    { keyword: "beach", categorySlug: "beach", label: "Added a beach" },
    { keyword: "museum", categorySlug: "attraction", label: "Added an attraction" },
    { keyword: "restaurant", categorySlug: "restaurant", label: "Added a restaurant" },
    { keyword: "cafe", categorySlug: "cafe", label: "Added a café" },
  ];

  const match = additionKeywords.find((k) => message.includes(k.keyword));
  if (match) {
    const dayIds = days.map((day) => day.id);
    const usedPlaceIds = (
      await db.select({ placeId: itineraryItems.placeId }).from(itineraryItems).where(inArray(itineraryItems.tripDayId, dayIds))
    )
      .map((r) => r.placeId)
      .filter((v): v is string => Boolean(v));

    const candidate = await db
      .select({ place: places })
      .from(places)
      .innerJoin(placeCategories, eq(places.categoryId, placeCategories.id))
      .where(
        and(
          ilike(places.city, trip.destinationCity),
          ilike(places.country, trip.destinationCountry),
          eq(places.status, "approved"),
          eq(placeCategories.slug, match.categorySlug),
          usedPlaceIds.length ? notInArray(places.id, usedPlaceIds) : undefined,
        ),
      )
      .limit(1);

    if (candidate.length === 0) {
      return NextResponse.json({ applied: null, message: `No known ${match.categorySlug} found in ${trip.destinationCity} yet — try suggesting one in Community.` });
    }

    const lastDay = days[days.length - 1];
    await db.insert(itineraryItems).values({
      tripDayId: lastDay.id,
      placeId: candidate[0].place.id,
      title: candidate[0].place.name,
      category: match.categorySlug,
      status: "suggested",
      sortOrder: 999,
    });

    return NextResponse.json({ applied: match.categorySlug, message: `${match.label}: ${candidate[0].place.name} on day ${lastDay.dayIndex + 1}.` });
  }

  return NextResponse.json({
    applied: null,
    message: "I can currently help with: \"make it cheaper\", or \"add a beach / restaurant / cafe / museum\". More flexible edits are on the roadmap.",
  });
}
