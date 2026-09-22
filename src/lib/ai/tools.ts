import "server-only";
import { ilike, eq, and, or, asc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { itineraryItems, places, tripDays, trips } from "@/db/schema";
import type { AiToolDefinition } from "./provider";
import { escapeLikePattern, normalizeAiToolText } from "./tool-input";
import type { OwnerContext } from "@/lib/auth/owner-context";
import { addPlaceToTrip, createTrip, moveItineraryItem, removeItineraryItem, summarizeTripBudget } from "@/lib/trips/actions";
import { loadOwnedTrip } from "@/lib/trips/ownership";
import { forgetMemory, isMemoryKind, listMemories, rememberPreference, MEMORY_KINDS } from "@/lib/memory/user-memory";

// Tool-calling scaffold: Sindbad AI works on the traveller's real trip instead
// of describing changes it cannot make.
//
// Two rules hold every tool together:
//   1. The model never supplies an identity. Ownership comes from the session
//      on the server, so "delete my restaurant" can only ever touch the
//      caller's own trip, whatever the model was told to do.
//   2. Every mutation goes through lib/trips/actions, the same guarded layer
//      the UI buttons use, so booked items and foreign trips are protected in
//      one place rather than once per caller.

export interface AiToolContext {
  owner: OwnerContext;
  /** Trip the conversation is attached to, when the UI supplied one. */
  tripId?: string;
}

export const AI_TOOLS: AiToolDefinition[] = [
  {
    name: "create_trip",
    description:
      "Create a brand-new, empty trip for the traveller (destination, dates, travellers, budget) so it is saved in My Sindbad, not just described in this chat. Use this whenever the traveller wants to plan a trip and does not already have one for this conversation - ask for whatever of destination, dates or budget is missing first, never invent them. After creating it, use the returned trip id for add_place_to_trip so places actually land in it.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short trip title, e.g. 'Marrakech getaway'. Invent a reasonable one if the traveller did not give one." },
        destinationCity: { type: "string", description: "Destination city" },
        destinationCountry: { type: "string", description: "Destination country" },
        startDate: { type: "string", description: "Start date, YYYY-MM-DD" },
        endDate: { type: "string", description: "End date, YYYY-MM-DD, on or after startDate" },
        travelers: { type: "number", description: "Number of travellers, defaults to 1" },
        budgetAmount: { type: "number", description: "Optional total budget" },
        budgetCurrency: { type: "string", description: "Optional 3-letter currency code, e.g. USD. Defaults to USD." },
      },
      required: ["destinationCity", "destinationCountry", "startDate", "endDate"],
    },
  },
  {
    name: "search_places",
    description: "Search My Sindbad's verified places database by city, optional country, and optional keyword.",
    parameters: {
      type: "object",
      properties: {
        city: { type: "string", description: "City to search in, e.g. Marrakech" },
        country: { type: "string", description: "Optional country to disambiguate cities with the same name" },
        keyword: { type: "string", description: "Optional keyword, e.g. beach, museum, seafood" },
      },
      required: ["city"],
    },
  },
  {
    name: "list_my_trips",
    description:
      "List the traveller's own trips with destination, dates, travellers and budget. Use this to find the trip the traveller means before changing anything.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_trip",
    description:
      "Read one of the traveller's trips in full: every day, the activities planned on each day with their ids, and the budget against the planned cost. Use the itinerary item ids it returns when removing or moving an activity.",
    parameters: {
      type: "object",
      properties: {
        tripId: { type: "string", description: "Trip id. Defaults to the trip the conversation is attached to." },
      },
      required: [],
    },
  },
  {
    name: "add_place_to_trip",
    description:
      "Add a place from the places database to a day of the traveller's trip. Find the place id with search_places first. Never invent a place id.",
    parameters: {
      type: "object",
      properties: {
        placeId: { type: "string", description: "Id of an existing place from search_places" },
        tripId: { type: "string", description: "Trip id. Defaults to the trip the conversation is attached to." },
        dayIndex: { type: "number", description: "Zero-based day number within the trip. Omit to use the first day." },
      },
      required: ["placeId"],
    },
  },
  {
    name: "remove_itinerary_item",
    description:
      "Remove one activity from the traveller's trip using the itinerary item id from get_trip. An activity linked to a booking cannot be removed this way.",
    parameters: {
      type: "object",
      properties: { itemId: { type: "string", description: "Itinerary item id from get_trip" } },
      required: ["itemId"],
    },
  },
  {
    name: "move_itinerary_item",
    description: "Move one activity to a different day of the same trip, using the itinerary item id from get_trip.",
    parameters: {
      type: "object",
      properties: {
        itemId: { type: "string", description: "Itinerary item id from get_trip" },
        dayIndex: { type: "number", description: "Zero-based day number to move the activity to" },
      },
      required: ["itemId", "dayIndex"],
    },
  },
  {
    name: "remember_preference",
    description:
      "Save one lasting fact about how this traveller likes to travel, so future trips start from what they already told you. Only durable personal facts: travel style, cuisines or place types they like or avoid, who they usually travel with, their usual budget level, requirements such as accessibility or halal food. Never store prices, opening hours, weather, availability or anything about a specific date - those change and must be looked up live.",
    parameters: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          description: "One of: preference, interest, avoid, companion, budget_style, constraint",
        },
        key: { type: "string", description: "Short stable label, e.g. cuisine, pace, travels_with, budget_level" },
        value: { type: "string", description: "The preference in the traveller's own terms, under 200 characters" },
      },
      required: ["kind", "key", "value"],
    },
  },
  {
    name: "list_preferences",
    description: "List what is already remembered about this traveller, with the ids needed to forget any of them.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "forget_preference",
    description: "Forget one remembered preference, using the id from list_preferences. Use whenever the traveller asks you to forget something.",
    parameters: {
      type: "object",
      properties: { memoryId: { type: "string", description: "Memory id from list_preferences" } },
      required: ["memoryId"],
    },
  },
];

function readId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  // Ids in this product are UUIDs; anything else is a hallucination, not a lookup.
  return /^[0-9a-fA-F-]{36}$/.test(trimmed) ? trimmed : null;
}

function readDayIndex(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  const rounded = Math.trunc(parsed);
  return rounded >= 0 && rounded <= 364 ? rounded : undefined;
}

/** Human-readable failures the model can act on, never raw internals. */
const ACTION_MESSAGE: Record<string, string> = {
  trip_not_found: "That trip does not exist.",
  forbidden: "That trip does not belong to this traveller.",
  day_not_found: "That day is not part of the trip.",
  place_not_found: "That place id does not match any place in the database.",
  item_not_found: "That itinerary item does not exist.",
  item_booked: "That activity is linked to a booking, so it cannot be changed here.",
  invalid_dates: "The end date must be on or after the start date.",
  trip_too_long: "A trip can span at most 365 days.",
};

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  context: AiToolContext,
): Promise<unknown> {
  const { owner } = context;
  const hasOwner = Boolean(owner.userId || owner.guestId);

  if (name === "create_trip") {
    const cityInput = normalizeAiToolText(args.destinationCity, 120, true);
    const countryInput = normalizeAiToolText(args.destinationCountry, 120, true);
    const titleInput = normalizeAiToolText(args.title, 200);
    if (!cityInput.ok || !cityInput.value) return { error: "destinationCity is required." };
    if (!countryInput.ok || !countryInput.value) return { error: "destinationCountry is required." };
    if (!titleInput.ok) return { error: "title is invalid." };

    const startDate = typeof args.startDate === "string" ? args.startDate.trim() : "";
    const endDate = typeof args.endDate === "string" ? args.endDate.trim() : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return { error: "startDate and endDate are required, as YYYY-MM-DD." };
    }

    const travelersRaw = Number(args.travelers);
    const travelers = Number.isFinite(travelersRaw) ? Math.min(Math.max(Math.trunc(travelersRaw), 1), 30) : 1;

    let budgetAmount: number | undefined;
    if (args.budgetAmount !== undefined && args.budgetAmount !== null) {
      const parsed = Number(args.budgetAmount);
      if (Number.isFinite(parsed) && parsed >= 0) budgetAmount = Math.min(parsed, 1_000_000);
    }

    const currencyInput = normalizeAiToolText(args.budgetCurrency, 3);
    const budgetCurrency = currencyInput.ok && currencyInput.value && /^[A-Za-z]{3}$/.test(currencyInput.value) ? currencyInput.value.toUpperCase() : "USD";

    const result = await createTrip({
      title: titleInput.value || `${cityInput.value} trip`,
      destinationCity: cityInput.value,
      destinationCountry: countryInput.value,
      startDate,
      endDate,
      travelers,
      budgetAmount,
      budgetCurrency,
      owner,
    });
    if (!result.ok) return { error: ACTION_MESSAGE[result.error] ?? "That trip could not be created." };
    return {
      created: {
        tripId: result.data.trip.id,
        title: result.data.trip.title,
        destinationCity: result.data.trip.destinationCity,
        destinationCountry: result.data.trip.destinationCountry,
        startDate: result.data.trip.startDate,
        endDate: result.data.trip.endDate,
        dayCount: result.data.dayCount,
      },
    };
  }

  if (name === "search_places") {
    const cityInput = normalizeAiToolText(args.city, 120, true);
    const countryInput = normalizeAiToolText(args.country, 120);
    const keywordInput = normalizeAiToolText(args.keyword, 200);
    if (!cityInput.ok) return { error: cityInput.reason === "required" ? "city is required" : "city is invalid" };
    if (!countryInput.ok) return { error: "country is invalid" };
    if (!keywordInput.ok) return { error: "keyword is invalid" };

    const city = escapeLikePattern(cityInput.value!);
    const country = countryInput.value ? escapeLikePattern(countryInput.value) : undefined;
    const keyword = keywordInput.value ? escapeLikePattern(keywordInput.value) : undefined;

    const conditions = [ilike(places.city, city), eq(places.status, "approved")];
    if (country) conditions.push(ilike(places.country, country));
    if (keyword) {
      conditions.push(or(ilike(places.name, "%" + keyword + "%"), ilike(places.description, "%" + keyword + "%"))!);
    }

    const rows = await db
      .select({ id: places.id, name: places.name, description: places.description, rating: places.ratingAverage })
      .from(places)
      .where(and(...conditions))
      .limit(5);

    if (rows.length === 0) {
      return { results: [], note: "No verified My Sindbad places found for this city yet. Say so plainly rather than inventing one." };
    }
    return { results: rows };
  }

  if (name === "list_my_trips") {
    if (!hasOwner) return { trips: [], note: "This traveller has no trips yet." };
    const ownerFilter = owner.userId ? eq(trips.userId, owner.userId) : eq(trips.guestId, owner.guestId!);
    const rows = await db
      .select({
        id: trips.id,
        title: trips.title,
        destinationCity: trips.destinationCity,
        destinationCountry: trips.destinationCountry,
        startDate: trips.startDate,
        endDate: trips.endDate,
        travelers: trips.travelers,
        budgetAmount: trips.budgetAmount,
        budgetCurrency: trips.budgetCurrency,
        status: trips.status,
      })
      .from(trips)
      .where(ownerFilter)
      .orderBy(asc(trips.createdAt))
      .limit(20);
    return { trips: rows };
  }

  if (name === "get_trip") {
    const tripId = readId(args.tripId) ?? context.tripId ?? null;
    if (!tripId) return { error: "No trip specified. Call list_my_trips first." };

    const { trip, allowed } = await loadOwnedTrip(tripId, owner);
    if (!trip) return { error: ACTION_MESSAGE.trip_not_found };
    if (!allowed) return { error: ACTION_MESSAGE.forbidden };

    const days = await db.select().from(tripDays).where(eq(tripDays.tripId, tripId)).orderBy(asc(tripDays.dayIndex));
    const dayIds = days.map((day) => day.id);
    const items = dayIds.length
      ? await db
          .select({
            id: itineraryItems.id,
            tripDayId: itineraryItems.tripDayId,
            title: itineraryItems.title,
            category: itineraryItems.category,
            startTime: itineraryItems.startTime,
            estimatedCost: itineraryItems.estimatedCost,
            currency: itineraryItems.currency,
            placeId: itineraryItems.placeId,
            booked: itineraryItems.bookingId,
          })
          .from(itineraryItems)
          .where(inArray(itineraryItems.tripDayId, dayIds))
          .orderBy(asc(itineraryItems.sortOrder))
      : [];

    const budget = await summarizeTripBudget(tripId);

    return {
      trip: {
        id: trip.id,
        title: trip.title,
        destination: trip.destinationCity + ", " + trip.destinationCountry,
        startDate: trip.startDate,
        endDate: trip.endDate,
        travelers: trip.travelers,
      },
      budget,
      days: days.map((day) => ({
        dayIndex: day.dayIndex,
        date: day.date,
        items: items
          .filter((item) => item.tripDayId === day.id)
          .map((item) => ({
            itemId: item.id,
            title: item.title,
            category: item.category,
            startTime: item.startTime,
            // A missing estimate stays missing: the model must not present an
            // unpriced activity as free.
            estimatedCost: item.estimatedCost,
            currency: item.currency,
            isBooked: Boolean(item.booked),
          })),
      })),
    };
  }

  if (name === "add_place_to_trip") {
    const placeId = readId(args.placeId);
    if (!placeId) return { error: "placeId must be an id returned by search_places." };
    const tripId = readId(args.tripId) ?? context.tripId ?? null;
    if (!tripId) return { error: "No trip specified. Call list_my_trips first." };

    const result = await addPlaceToTrip({ tripId, placeId, dayIndex: readDayIndex(args.dayIndex), owner });
    if (!result.ok) return { error: ACTION_MESSAGE[result.error] ?? "That change could not be applied." };
    return {
      added: { itemId: result.data.id, title: result.data.title, dayIndex: result.data.dayIndex, date: result.data.date },
    };
  }

  if (name === "remove_itinerary_item") {
    const itemId = readId(args.itemId);
    if (!itemId) return { error: "itemId must be an id returned by get_trip." };

    const result = await removeItineraryItem({ itemId, owner });
    if (!result.ok) return { error: ACTION_MESSAGE[result.error] ?? "That change could not be applied." };
    return { removed: result.data.removedId };
  }

  if (name === "move_itinerary_item") {
    const itemId = readId(args.itemId);
    if (!itemId) return { error: "itemId must be an id returned by get_trip." };
    const dayIndex = readDayIndex(args.dayIndex);
    if (dayIndex === undefined) return { error: "dayIndex must be a day number within the trip." };

    const result = await moveItineraryItem({ itemId, toDayIndex: dayIndex, owner });
    if (!result.ok) return { error: ACTION_MESSAGE[result.error] ?? "That change could not be applied." };
    return { moved: { itemId: result.data.id, dayIndex: result.data.dayIndex, date: result.data.date } };
  }

  // Memory belongs to an account. A guest has no stable identity to attach
  // lasting preferences to, so nothing is written for one.
  if (name === "remember_preference") {
    if (!owner.userId) return { error: "Only a signed-in traveller has a saved profile. Invite them to create an account first." };

    const kindInput = normalizeAiToolText(args.kind, 32, true);
    const keyInput = normalizeAiToolText(args.key, 80, true);
    const valueInput = normalizeAiToolText(args.value, 200, true);
    if (!kindInput.ok || !kindInput.value) return { error: "kind is required." };
    if (!keyInput.ok || !keyInput.value) return { error: "key is required." };
    if (!valueInput.ok || !valueInput.value) return { error: "value is required." };

    const kind = kindInput.value;
    const key = keyInput.value;
    const value = valueInput.value;
    if (!isMemoryKind(kind)) return { error: "kind must be one of: " + MEMORY_KINDS.join(", ") };

    const result = await rememberPreference({ userId: owner.userId, kind, key, value });

    if (!result.ok) {
      if (result.reason === "world_fact") {
        return {
          error:
            "That looks like a fact about the world (a price, opening time, weather or a specific date) rather than a lasting preference. Those are looked up live and must not be remembered.",
        };
      }
      if (result.reason === "limit_reached") {
        return { error: "This traveller's profile is full. Forget an old preference before saving a new one." };
      }
      return { error: "That preference could not be saved." };
    }

    return { remembered: { id: result.memory.id, key: result.memory.key, value: result.memory.value, replaced: result.replaced } };
  }

  if (name === "list_preferences") {
    if (!owner.userId) return { preferences: [], note: "This traveller is browsing as a guest, so nothing is remembered yet." };
    const memories = await listMemories(owner.userId);
    return {
      preferences: memories.map((memory) => ({ id: memory.id, kind: memory.kind, key: memory.key, value: memory.value })),
    };
  }

  if (name === "forget_preference") {
    if (!owner.userId) return { error: "Nothing is remembered for a guest." };
    const memoryId = readId(args.memoryId);
    if (!memoryId) return { error: "memoryId must be an id returned by list_preferences." };
    const removed = await forgetMemory(owner.userId, memoryId);
    return removed ? { forgotten: memoryId } : { error: "That preference was not found." };
  }

  return { error: "Unknown tool: " + name };
}
