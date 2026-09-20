import "server-only";
import { z } from "zod";
import type { AiProvider } from "@/lib/ai/provider";
import type { PlannerDayPlan, PlannerPlace } from "./heuristic-planner";
import { isValidClockTime } from "./time";

const aiPlanSchema = z.object({
  days: z.array(
    z.object({
      dayIndex: z.number().int().min(0),
      items: z.array(
        z.object({
          placeId: z.string().uuid(),
          startTime: z.string().refine(isValidClockTime),
        }),
      ).max(5),
    }),
  ).max(365),
});

export interface AiPlannerInput {
  dayCount: number;
  budgetPerDay: number;
  travelStyle?: string;
  interests: string[];
  places: PlannerPlace[];
}

/**
 * AI may choose and order only IDs from the verified candidate pool. Titles,
 * categories and cost estimates are rebuilt from authoritative local data, so
 * the model cannot invent a place or silently alter its price metadata.
 */
export async function buildGroundedAiItinerary(provider: AiProvider, input: AiPlannerInput): Promise<PlannerDayPlan[] | null> {
  if (input.places.length === 0 || input.dayCount < 1) return null;

  const compactPlaces = input.places.slice(0, 40).map((p) => ({ id: p.id, name: p.name, category: p.categorySlug, priceLevel: p.priceLevel }));
  const prompt = [
    "Build a travel itinerary using ONLY the candidate place IDs below.",
    `Days: ${input.dayCount}. Budget/day: ${Math.round(input.budgetPerDay)}. Style: ${input.travelStyle ?? "balanced"}. Interests: ${input.interests.join(", ") || "general"}.`,
    'Return JSON only in this exact shape: {"days":[{"dayIndex":0,"items":[{"placeId":"uuid","startTime":"09:00"}]}]}.',
    "Rules: dayIndex must be 0-based and within the trip; use each place at most once; choose at most 5 places/day; use valid HH:MM times; do not invent IDs.",
    `Candidates: ${JSON.stringify(compactPlaces)}`,
  ].join("\n");

  const result = await provider.complete([
    { role: "system", content: "You are a constrained itinerary planner. Output JSON only and never invent IDs." },
    { role: "user", content: prompt },
  ]);

  const parsedJson = extractJsonObject(result.content);
  if (!parsedJson) return null;
  const parsed = aiPlanSchema.safeParse(parsedJson);
  if (!parsed.success) return null;

  const byId = new Map(input.places.map((p) => [p.id, p]));
  const used = new Set<string>();
  const usedDayIndexes = new Set<number>();
  const days: PlannerDayPlan[] = [];
  const perItemBudget = input.budgetPerDay / 5;

  for (const day of parsed.data.days) {
    if (day.dayIndex >= input.dayCount) continue;
    // Duplicate day objects can overfill one itinerary day despite per-day
    // item bounds. Treat the model output as invalid and use the deterministic
    // fallback rather than guessing which duplicate block to keep.
    if (usedDayIndexes.has(day.dayIndex)) return null;
    usedDayIndexes.add(day.dayIndex);
    const items: PlannerDayPlan["items"] = [];
    for (const item of day.items) {
      const place = byId.get(item.placeId);
      if (!place || used.has(place.id)) continue;
      used.add(place.id);
      items.push({
        placeId: place.id,
        title: place.name,
        category: place.categorySlug ?? "activity",
        startTime: item.startTime,
        estimatedCost: Math.max(0, Math.round(perItemBudget * (0.6 + Math.max(0, place.priceLevel) * 0.2))),
      });
    }
    days.push({ dayIndex: day.dayIndex, items });
  }

  days.sort((a, b) => a.dayIndex - b.dayIndex);
  return days.some((d) => d.items.length > 0) ? days : null;
}

function extractJsonObject(content: string | null): unknown | null {
  if (!content) return null;
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}
