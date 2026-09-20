// A deterministic, non-AI fallback itinerary builder. Used whenever no AI
// provider is configured so the trip planner still produces a genuinely
// useful (if simpler) result instead of blocking the feature or faking an
// AI response. It only arranges *real* places already stored in the
// database — it never invents destinations or facts.
export interface PlannerPlace {
  id: string;
  name: string;
  categorySlug: string | null;
  priceLevel: number;
}

export interface PlannerDayPlan {
  dayIndex: number;
  items: Array<{
    placeId: string | null;
    title: string;
    category: string;
    startTime: string;
    estimatedCost: number;
  }>;
}

const DAY_SLOTS = [
  { time: "09:00", category: "breakfast" },
  { time: "11:00", category: "attraction" },
  { time: "14:00", category: "restaurant" },
  { time: "17:00", category: "activity" },
  { time: "20:00", category: "restaurant" },
];

const CATEGORY_FALLBACK: Record<string, string[]> = {
  breakfast: ["cafe", "restaurant"],
  attraction: ["attraction", "beach", "landmark"],
  restaurant: ["restaurant", "cafe"],
  activity: ["activity", "tour", "attraction"],
};

export function buildHeuristicItinerary(dayCount: number, budgetPerDay: number, places: PlannerPlace[]): PlannerDayPlan[] {
  const used = new Set<string>();
  const days: PlannerDayPlan[] = [];

  for (let dayIndex = 0; dayIndex < dayCount; dayIndex++) {
    const items: PlannerDayPlan["items"] = [];
    for (const slot of DAY_SLOTS) {
      const candidateCategories = CATEGORY_FALLBACK[slot.category] ?? [slot.category];
      const candidate = places.find(
        (place) => !used.has(place.id) && candidateCategories.includes(place.categorySlug ?? ""),
      );
      if (candidate) {
        used.add(candidate.id);
        items.push({
          placeId: candidate.id,
          title: candidate.name,
          category: slot.category,
          startTime: slot.time,
          estimatedCost: Math.round((budgetPerDay / DAY_SLOTS.length) * (0.6 + candidate.priceLevel * 0.2)),
        });
      } else {
        items.push({
          placeId: null,
          title: `Free time — explore ${slot.category}`,
          category: slot.category,
          startTime: slot.time,
          estimatedCost: 0,
        });
      }
    }
    days.push({ dayIndex, items });
  }
  return days;
}
