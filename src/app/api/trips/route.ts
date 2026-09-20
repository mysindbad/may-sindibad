import { NextResponse } from "next/server";
import { and, eq, ilike, isNull } from "drizzle-orm";
import { db } from "@/db";
import { trips, tripDays, itineraryItems, places, placeCategories } from "@/db/schema";
import { getOwnerContext, resolveOwnerContext } from "@/lib/auth/owner-context";
import { tripCreateSchema } from "@/lib/validation";
import { jsonError, zodErrorResponse } from "@/lib/api-utils";
import { isTrustedMutationRequest } from "@/lib/security/mutation-origin";
import { parseJsonBodyWithLimit } from "@/lib/http/bounded-body";
import { buildHeuristicItinerary } from "@/lib/domain/heuristic-planner";
import { buildGroundedAiItinerary } from "@/lib/domain/ai-itinerary-planner";
import { getAiProvider } from "@/lib/ai";
import { checkRateLimit, clientKeyFromRequest } from "@/lib/rate-limit";
import { isoDateDifferenceDays } from "@/lib/domain/date";
import { toClientTripView } from "@/lib/trips/client-view";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId, guestId } = await getOwnerContext();
  const ownerFilter = userId ? eq(trips.userId, userId) : guestId ? and(isNull(trips.userId), eq(trips.guestId, guestId)) : undefined;
  if (!ownerFilter) return NextResponse.json({ trips: [] });

  const rows = await db.select().from(trips).where(ownerFilter).orderBy(trips.createdAt);
  return NextResponse.json({ trips: rows.map(toClientTripView) });
}

function dateRangeDays(startDate: string, endDate: string): string[] {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const days: string[] = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }
  return days.length > 0 ? days : [startDate];
}

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return jsonError("Request origin is not allowed.", 403);
  const { userId, guestId } = await resolveOwnerContext();
  const actorId = userId ?? guestId ?? "anonymous";
  const rate = await checkRateLimit(clientKeyFromRequest(request, `trip:${actorId}`), 20, 60 * 60 * 1000);
  if (!rate.allowed) return jsonError("Too many trip creation attempts. Please slow down.", 429);

  const json = await parseJsonBodyWithLimit(request);
  if (!json.ok) return jsonError("Request body is too large.", 413);
  const body = json.body;
  const parsed = tripCreateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const data = parsed.data;

  const tripDuration = isoDateDifferenceDays(data.startDate, data.endDate);
  if (tripDuration === null || tripDuration < 0) {
    return jsonError("End date must be on or after the start date.", 422);
  }
  if (tripDuration > 364) return jsonError("Trips can contain at most 365 calendar days.", 422);

  const dayDates = dateRangeDays(data.startDate, data.endDate);
  const { trip, insertedDays } = await db.transaction(async (tx) => {
    const [createdTrip] = await tx
      .insert(trips)
      .values({
        userId,
        guestId,
        title: data.title,
        destinationCity: data.destinationCity,
        destinationCountry: data.destinationCountry,
        startDate: data.startDate,
        endDate: data.endDate,
        travelers: data.travelers,
        budgetAmount: data.budgetAmount?.toString(),
        budgetCurrency: data.budgetCurrency,
        travelStyle: data.travelStyle,
        interests: data.interests,
        notes: data.notes,
        status: "draft",
        generatedBy: "manual",
      })
      .returning();

    const createdDays = await tx
      .insert(tripDays)
      .values(dayDates.map((date, index) => ({ tripId: createdTrip.id, dayIndex: index, date })))
      .returning();

    return { trip: createdTrip, insertedDays: createdDays };
  });

  let aiNotice: string | null = null;
  let finalTrip = trip;

  if (data.generateItinerary) {
    const candidatePlaces = await db
      .select({ id: places.id, name: places.name, priceLevel: places.priceLevel, categorySlug: placeCategories.slug })
      .from(places)
      .leftJoin(placeCategories, eq(places.categoryId, placeCategories.id))
      .where(and(eq(places.status, "approved"), ilike(places.city, data.destinationCity), ilike(places.country, data.destinationCountry)))
      .limit(60);

    const aiProvider = getAiProvider();
    const budgetPerDay = (data.budgetAmount ?? 100) / Math.max(dayDates.length, 1);

    let plan = null as ReturnType<typeof buildHeuristicItinerary> | null;
    let generatedBy = "heuristic";

    if (aiProvider) {
      try {
        plan = await buildGroundedAiItinerary(aiProvider, {
          dayCount: dayDates.length,
          budgetPerDay,
          travelStyle: data.travelStyle,
          interests: data.interests,
          places: candidatePlaces,
        });
        if (plan) generatedBy = "ai";
        else aiNotice = "ai_fallback";
      } catch (error) {
        console.error("AI itinerary generation failed; using grounded heuristic fallback", error);
        aiNotice = "ai_fallback";
      }
    } else {
      aiNotice = "ai_not_configured";
    }

    if (!plan) plan = buildHeuristicItinerary(dayDates.length, budgetPerDay, candidatePlaces);

    const plannedItems = plan.flatMap((dayPlan) => {
      const tripDay = insertedDays[dayPlan.dayIndex];
      if (!tripDay) return [];
      return dayPlan.items.map((item, sortOrder) => ({
        tripDayId: tripDay.id,
        placeId: item.placeId,
        title: item.title,
        category: item.category,
        startTime: item.startTime,
        estimatedCost: item.estimatedCost.toString(),
        currency: data.budgetCurrency,
        status: "suggested" as const,
        sortOrder,
      }));
    });
    finalTrip = await db.transaction(async (tx) => {
      if (plannedItems.length > 0) await tx.insert(itineraryItems).values(plannedItems);
      const [updatedTrip] = await tx
        .update(trips)
        .set({ status: "planned", generatedBy, updatedAt: new Date() })
        .where(eq(trips.id, trip.id))
        .returning();
      return updatedTrip ?? trip;
    });
  }

  return NextResponse.json({ trip: toClientTripView(finalTrip), days: insertedDays, aiNotice }, { status: 201 });
}
