import { notFound } from "next/navigation";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { tripDays, itineraryItems } from "@/db/schema";
import { getOwnerContext } from "@/lib/auth/owner-context";
import { loadOwnedTrip } from "@/lib/trips/ownership";
import { ItineraryBoard } from "@/components/trips/ItineraryBoard";
import { isAiConfigured } from "@/lib/ai";

export const dynamic = "force-dynamic";

export default async function TripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owner = await getOwnerContext();
  const { trip, allowed } = await loadOwnedTrip(id, owner);
  if (!trip || !allowed) notFound();

  const days = await db.select().from(tripDays).where(eq(tripDays.tripId, id)).orderBy(asc(tripDays.dayIndex));
  const dayIds = days.map((d) => d.id);
  const items = dayIds.length
    ? await db.select().from(itineraryItems).where(inArray(itineraryItems.tripDayId, dayIds)).orderBy(asc(itineraryItems.sortOrder))
    : [];

  return (
    <ItineraryBoard
      trip={{ id: trip.id, title: trip.title, status: trip.status, budgetCurrency: trip.budgetCurrency }}
      days={days.map((day) => ({
        id: day.id,
        dayIndex: day.dayIndex,
        date: day.date,
        items: items
          .filter((item) => item.tripDayId === day.id)
          .map((item) => ({
            id: item.id,
            title: item.title,
            category: item.category,
            startTime: item.startTime,
            estimatedCost: item.estimatedCost,
            currency: item.currency,
            status: item.status,
            notes: item.notes,
          })),
      }))}
      aiNotice={trip.generatedBy === "heuristic" && !isAiConfigured() ? "ai_not_configured" : null}
    />
  );
}
