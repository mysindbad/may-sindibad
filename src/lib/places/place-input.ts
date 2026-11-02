import { z } from "zod";

// Input contract for admin-authored places. Status mapping onto the existing
// content_status enum (no schema change needed):
//   pending  -> draft, not visible to travellers
//   approved -> published
//   rejected -> archived (hidden, kept; can be restored to draft)
//   flagged  -> unchanged moderation state
// Everything beyond name/city/country/coordinates is optional, so an admin is
// never forced to invent data just to save a draft.

export const PLACE_STATUSES = ["pending", "approved", "rejected", "flagged"] as const;
export type PlaceStatusValue = (typeof PLACE_STATUSES)[number];

function optionalText(max: number) {
  return z
    .union([z.string(), z.null()])
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      if (value === null) return null;
      const trimmed = value.trim();
      return trimmed === "" ? null : trimmed;
    })
    .refine((value) => value === undefined || value === null || value.length <= max, { message: `Must be at most ${max} characters.` });
}

const requiredText = (min: number, max: number) => z.string().trim().min(min).max(max);

const latitude = z.number().finite().min(-90).max(90);
const longitude = z.number().finite().min(-180).max(180);

export const placeFieldsSchema = z.object({
  name: requiredText(2, 200),
  description: optionalText(4000),
  categoryId: z.union([z.string().uuid(), z.null()]).optional(),
  city: requiredText(1, 120),
  country: requiredText(1, 120),
  address: optionalText(500),
  lat: latitude,
  lng: longitude,
  priceLevel: z.number().int().min(0).max(4).optional(),
  coverImageUrl: optionalText(500),
});

const notNullIsland = (value: { lat?: number; lng?: number }) => !(value.lat === 0 && value.lng === 0);
const NULL_ISLAND = { message: "Coordinates (0, 0) are not a real location.", path: ["lat"] };

export const placeCreateSchema = placeFieldsSchema
  .extend({
    status: z.enum(["pending", "approved"]).default("pending"),
    /** Acknowledge a near-duplicate warning and create anyway. */
    allowDuplicate: z.boolean().optional(),
  })
  .strict()
  .refine(notNullIsland, NULL_ISLAND);

export const placeUpdateSchema = placeFieldsSchema
  .partial()
  .extend({
    status: z.enum(PLACE_STATUSES).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to update." })
  .refine(notNullIsland, NULL_ISLAND);

export type PlaceCreateInput = z.infer<typeof placeCreateSchema>;
export type PlaceUpdateInput = z.infer<typeof placeUpdateSchema>;

export interface PublishCandidate {
  name?: string | null;
  city?: string | null;
  country?: string | null;
  categoryId?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export type PublishBlocker = "name" | "city" | "country" | "category" | "coordinates";

/**
 * What a place must have before travellers can see it. A cover image is NOT
 * required - the app shows an honest placeholder - but a place with no
 * category or no real coordinates would be unfindable or un-navigable.
 */
export function publishBlockers(place: PublishCandidate): PublishBlocker[] {
  const blockers: PublishBlocker[] = [];
  if (!place.name || place.name.trim().length < 2) blockers.push("name");
  if (!place.city || !place.city.trim()) blockers.push("city");
  if (!place.country || !place.country.trim()) blockers.push("country");
  if (!place.categoryId) blockers.push("category");
  const validCoordinates =
    typeof place.lat === "number" &&
    typeof place.lng === "number" &&
    Number.isFinite(place.lat) &&
    Number.isFinite(place.lng) &&
    Math.abs(place.lat) <= 90 &&
    Math.abs(place.lng) <= 180 &&
    !(place.lat === 0 && place.lng === 0);
  if (!validCoordinates) blockers.push("coordinates");
  return blockers;
}

/** Cover images we serve ourselves (upload adapter output) versus a pasted external URL. */
export function isInternalCoverUrl(url: string, env: Record<string, string | undefined> = process.env): boolean {
  if (url.startsWith("/uploads/") || url.startsWith("/media/")) return !url.includes("..");
  const base = env.UPLOADS_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
  return Boolean(base) && url.startsWith(base + "/") && !url.includes("..");
}
