import { notFound } from "next/navigation";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { tripDays, itineraryItems } from "@/db/schema";
import { getOwnerContext } from "@/lib/auth/owner-context";
import { loadOwnedTrip } from "@/lib/trips/ownership";
import { ItineraryBoard } from "@/components/trips/ItineraryBoard";
import { TripBudgetCard } from "@/components/trips/TripBudgetCard";
import { summarizeTripBudget } from "@/lib/trips/actions";
import { isAiConfigured } from "@/lib/ai";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/getDictionary";

export const dynamic = "force-dynamic";

export default async function TripDetailPage({ params }: { params: Promise<{ id: string; locale: string }> }) {
  const { id, locale: rawLocale } = await params;
  const owner = await getOwnerContext();
  const { trip, allowed } = await loadOwnedTrip(id, owner);
  if (!trip || !allowed) notFound();

  const locale: Locale = isLocale(rawLocale) ? rawLocale : "en";

  const days = await db.select().from(tripDays).where(eq(tripDays.tripId, id)).orderBy(asc(tripDays.dayIndex));
  const dayIds = days.map((d) => d.id);
  const items = dayIds.length
    ? await db.select().from(itineraryItems).where(inArray(itineraryItems.tripDayId, dayIds)).orderBy(asc(itineraryItems.sortOrder))
    : [];
  const [dict, budget] = await Promise.all([getDictionary(locale), summarizeTripBudget(id)]);

  return (
    <div className="space-y-4">
      {/* The budget sits with the plan, so it moves whenever the plan moves. */}
      {budget && (
        <div className="mx-auto max-w-3xl px-4 pt-4">
          <TripBudgetCard summary={budget} dict={dict} locale={locale} />
        </div>
      )}

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
              placeId: item.placeId,
              startTime: item.startTime,
              estimatedCost: item.estimatedCost,
              currency: item.currency,
              status: item.status,
              notes: item.notes,
            })),
        }))}
        aiNotice={trip.generatedBy === "heuristic" && !isAiConfigured() ? "ai_not_configured" : null}
      />
    </div>
  );
}
