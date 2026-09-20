// Centralised zod schemas for every API input. Keeping them in one module
// makes it easy to audit what the server accepts, and guarantees UI forms
// and API routes agree on shape.
import { z } from "zod";
import { isValidIsoDate } from "@/lib/domain/date";
import { isValidClockTime } from "@/lib/domain/time";
import { hasCompleteCoordinatePair } from "@/lib/domain/coordinates";


const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isValidIsoDate, "Invalid calendar date.");
const clockTimeSchema = z.string().refine(isValidClockTime, "Time must be HH:MM in 24-hour format.");
const currencySchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{3}$/, "Currency must be a 3-letter ISO code."));
const httpUrlSchema = (maxLength: number) =>
  z
    .string()
    .url()
    .max(maxLength)
    .refine((value) => {
      try {
        const protocol = new URL(value).protocol;
        return protocol === "http:" || protocol === "https:";
      } catch {
        return false;
      }
    }, "URL must use http or https.");

export const emailSchema = z.string().trim().toLowerCase().email().max(255);
export const passwordSchema = z.string().min(8).max(200);

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(2).max(120),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  homeCity: z.string().trim().max(120).optional().nullable(),
  locale: z.enum(["en", "ar", "fr", "es", "de", "ru"]).optional(),
  avatarUrl: httpUrlSchema(1000).optional().nullable(),
});

export const tripCreateSchema = z.object({
  title: z.string().trim().min(2).max(200),
  destinationCity: z.string().trim().min(1).max(120),
  destinationCountry: z.string().trim().min(1).max(120),
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  travelers: z.number().int().min(1).max(30).default(1),
  budgetAmount: z.number().min(0).max(1_000_000).optional(),
  budgetCurrency: currencySchema.default("USD"),
  travelStyle: z.enum(["relaxed", "balanced", "packed", "luxury", "budget"]).optional(),
  interests: z.array(z.string().max(40)).max(20).default([]),
  notes: z.string().max(2000).optional(),
  generateItinerary: z.boolean().default(false),
});

export const tripUpdateSchema = tripCreateSchema.partial().extend({
  status: z.enum(["draft", "planned", "active", "completed", "cancelled"]).optional(),
});

export const itineraryItemUpdateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  startTime: clockTimeSchema.optional().nullable(),
  endTime: clockTimeSchema.optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  status: z.enum(["suggested", "confirmed", "booked", "skipped"]).optional(),
  placeId: z.string().uuid().optional().nullable(),
  estimatedCost: z.number().min(0).max(1_000_000).optional().nullable(),
});

export const aiChatSchema = z.object({
  conversationId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(4000),
  tripId: z.string().uuid().optional(),
});

export const contributionCreateSchema = z
  .object({
    type: z.enum(["new_place", "place_correction", "photo", "info_update"]),
    placeId: z.string().uuid().optional(),
    payload: z.record(z.string(), z.unknown()),
  })
  .superRefine((value, ctx) => {
    let payloadLength = 0;
    try {
      payloadLength = JSON.stringify(value.payload).length;
    } catch {
      payloadLength = Number.POSITIVE_INFINITY;
    }
    if (payloadLength > 16_000) {
      ctx.addIssue({ code: "custom", path: ["payload"], message: "Contribution payload is too large." });
    }

    if (value.type !== "new_place" && !value.placeId) {
      ctx.addIssue({ code: "custom", path: ["placeId"], message: "This contribution type requires an existing place." });
    }

    if (value.type === "new_place") {
      const p = value.payload;
      const name = typeof p.name === "string" ? p.name.trim() : "";
      const city = typeof p.city === "string" ? p.city.trim() : "";
      const country = typeof p.country === "string" ? p.country.trim() : "";
      const description = Object.prototype.hasOwnProperty.call(p, "description") ? p.description : undefined;
      if (description !== undefined && (typeof description !== "string" || description.length > 3000)) {
        ctx.addIssue({ code: "custom", path: ["payload", "description"], message: "Description must be text up to 3000 characters." });
      }
      const hasLat = Object.prototype.hasOwnProperty.call(p, "lat");
      const hasLng = Object.prototype.hasOwnProperty.call(p, "lng");
      const lat = typeof p.lat === "number" ? p.lat : NaN;
      const lng = typeof p.lng === "number" ? p.lng : NaN;
      if (name.length < 2 || name.length > 200) ctx.addIssue({ code: "custom", path: ["payload", "name"], message: "A valid place name is required." });
      if (!city || city.length > 120) ctx.addIssue({ code: "custom", path: ["payload", "city"], message: "A valid city is required." });
      if (!country || country.length > 120) ctx.addIssue({ code: "custom", path: ["payload", "country"], message: "A valid country is required." });
      if (hasLat !== hasLng) {
        ctx.addIssue({ code: "custom", path: ["payload"], message: "Latitude and longitude must be supplied together." });
      }
      if (hasLat && (!Number.isFinite(lat) || lat < -90 || lat > 90)) {
        ctx.addIssue({ code: "custom", path: ["payload", "lat"], message: "Latitude must be between -90 and 90." });
      }
      if (hasLng && (!Number.isFinite(lng) || lng < -180 || lng > 180)) {
        ctx.addIssue({ code: "custom", path: ["payload", "lng"], message: "Longitude must be between -180 and 180." });
      }
    }
  });

export const reviewCreateSchema = z
  .object({
    placeId: z.string().uuid().optional(),
    providerId: z.string().uuid().optional(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(2000).optional(),
  })
  .refine((v) => !!v.placeId !== !!v.providerId, {
    message: "Provide exactly one of placeId or providerId",
  });

export const reportCreateSchema = z.object({
  targetType: z.enum(["place", "provider", "review", "contribution", "user"]),
  targetId: z.string().uuid(),
  reason: z.enum(["spam", "inaccurate", "offensive", "duplicate", "closed", "other"]),
  details: z.string().max(1000).optional(),
});

export const favoriteToggleSchema = z.object({
  targetType: z.enum(["place", "provider"]),
  targetId: z.string().uuid(),
});

const providerFieldsSchema = z.object({
  name: z.string().trim().min(2).max(200),
  categorySlug: z.string().max(60).optional(),
  description: z.string().max(3000).optional(),
  city: z.string().trim().min(1).max(120),
  country: z.string().trim().min(1).max(120),
  address: z.string().max(300).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().email().max(255).optional(),
  website: httpUrlSchema(300).optional(),
  coverImageUrl: httpUrlSchema(1000).optional(),
});

export const providerCreateSchema = providerFieldsSchema.superRefine((value, ctx) => {
  if (!hasCompleteCoordinatePair(value.lat, value.lng)) {
    ctx.addIssue({ code: "custom", path: ["lat"], message: "Latitude and longitude must be supplied together." });
  }
});

// PATCH uses the base partial schema and validates the *effective* coordinate
// pair against the stored provider row. This permits changing one coordinate
// of an already complete pair while preventing creation of a half-coordinate
// state from an unlocated listing.
export const providerUpdateSchema = providerFieldsSchema.partial();

export const providerServiceCreateSchema = z.object({
  providerId: z.string().uuid(),
  category: z.enum(["hotel", "restaurant", "activity", "tour", "vehicle", "boat", "transfer", "other"]),
  name: z.string().trim().min(2).max(200),
  description: z.string().max(2000).optional(),
  priceAmount: z.number().min(0).max(1_000_000).optional(),
  priceCurrency: currencySchema.default("USD"),
  durationMinutes: z.number().int().min(1).max(100_000).optional(),
  capacity: z.number().int().min(1).max(10_000).optional(),
  coverImageUrl: httpUrlSchema(1000).optional(),
});

export const bookingCreateSchema = z.object({
  providerId: z.string().uuid(),
  serviceId: z.string().uuid(),
  category: z.enum(["hotel", "restaurant", "activity", "tour", "vehicle", "boat", "transfer", "other"]),
  itineraryItemId: z.string().uuid().optional(),
  startDate: isoDateSchema.optional(),
  endDate: isoDateSchema.optional(),
  guestsCount: z.number().int().min(1).max(50).default(1),
  contactName: z.string().trim().min(2).max(120),
  contactEmail: emailSchema,
  contactPhone: z.string().max(40).optional(),
  notes: z.string().max(1000).optional(),
  idempotencyKey: z.string().min(8).max(100),
});

export const paymentIntentCreateSchema = z.object({
  bookingId: z.string().uuid(),
  idempotencyKey: z.string().min(8).max(100),
  locale: z.enum(["en", "ar", "fr", "es", "de", "ru"]).default("en"),
});

export const uploadRequestSchema = z.object({
  ownerType: z.enum(["place", "provider", "review", "contribution", "avatar"]),
  ownerId: z.string().uuid().optional(),
});
