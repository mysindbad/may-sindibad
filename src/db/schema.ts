// My Sindbad — domain schema
//
// Design notes:
// - Every table that stores user-owned or community content has ownership /
//   provenance fields (createdBy, source, status) so trust can be modelled.
// - Enums are Postgres enums for integrity instead of loose strings.
// - Polymorphic references (media, contributions, reports, favorites,
//   sponsored placements) use a `targetType` + `targetId` pair. Drizzle/PG
//   cannot enforce a real FK across multiple tables, so ownership/existence
//   is validated in the application layer (see src/lib/validation.ts).
import {
  pgEnum,
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  numeric,
  boolean,
  timestamp,
  jsonb,
  doublePrecision,
  unique,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const userRoleEnum = pgEnum("user_role", ["traveler", "provider", "admin"]);
export const sourceTypeEnum = pgEnum("source_type", ["seed", "community", "provider", "verified"]);
export const contentStatusEnum = pgEnum("content_status", ["pending", "approved", "rejected", "flagged"]);
export const contributionTypeEnum = pgEnum("contribution_type", [
  "new_place",
  "place_correction",
  "photo",
  "info_update",
]);
export const reviewStatusEnum = pgEnum("review_status", ["published", "flagged", "removed"]);
export const reportStatusEnum = pgEnum("report_status", ["open", "reviewed", "dismissed", "actioned"]);
export const providerVerificationEnum = pgEnum("provider_verification", [
  "unverified",
  "pending",
  "verified",
  "suspended",
]);
export const tripStatusEnum = pgEnum("trip_status", ["draft", "planned", "active", "completed", "cancelled"]);
export const itineraryStatusEnum = pgEnum("itinerary_status", [
  "suggested",
  "confirmed",
  "booked",
  "skipped",
]);
export const bookingCategoryEnum = pgEnum("booking_category", [
  "hotel",
  "restaurant",
  "activity",
  "tour",
  "vehicle",
  "boat",
  "transfer",
  "other",
]);
export const bookingStatusEnum = pgEnum("booking_status", [
  "draft",
  "pending",
  "awaiting_payment",
  "confirmed",
  "cancelled",
  "completed",
  "refunded",
]);
export const paymentProviderEnum = pgEnum("payment_provider", ["stripe", "paypal", "cashplus", "demo"]);
export const paymentStatusEnum = pgEnum("payment_status", [
  "requires_payment",
  "processing",
  "succeeded",
  "failed",
  "refunded",
]);
export const aiRoleEnum = pgEnum("ai_role", ["user", "assistant", "system", "tool"]);
export const mediaKindEnum = pgEnum("media_kind", ["image", "video"]);

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash"),
  name: varchar("name", { length: 120 }).notNull(),
  avatarUrl: text("avatar_url"),
  role: userRoleEnum("role").notNull().default("traveler"),
  locale: varchar("locale", { length: 8 }).notNull().default("en"),
  homeCity: varchar("home_city", { length: 120 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authAccounts = pgTable(
  "auth_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 40 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("auth_accounts_provider_account_unique").on(t.provider, t.providerAccountId),
    uniqueIndex("auth_accounts_user_provider_unique").on(t.userId, t.provider),
    index("auth_accounts_user_idx").on(t.userId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    userAgent: text("user_agent"),
    ipAddress: varchar("ip_address", { length: 64 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Shared abuse-prevention state
// ---------------------------------------------------------------------------
export const rateLimitBuckets = pgTable("rate_limit_buckets", {
  keyHash: varchar("key_hash", { length: 64 }).primaryKey(),
  count: integer("count").notNull().default(0),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Places & categories
// ---------------------------------------------------------------------------
export const placeCategories = pgTable("place_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 60 }).notNull().unique(),
  labelKey: varchar("label_key", { length: 120 }).notNull(),
  icon: varchar("icon", { length: 40 }).notNull().default("map-pin"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const places = pgTable(
  "places",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    categoryId: uuid("category_id").references(() => placeCategories.id, { onDelete: "set null" }),
    city: varchar("city", { length: 120 }).notNull(),
    country: varchar("country", { length: 120 }).notNull(),
    address: text("address"),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    priceLevel: integer("price_level").notNull().default(0),
    coverImageUrl: text("cover_image_url"),
    ratingAverage: doublePrecision("rating_average").notNull().default(0),
    ratingCount: integer("rating_count").notNull().default(0),
    sourceType: sourceTypeEnum("source_type").notNull().default("seed"),
    status: contentStatusEnum("status").notNull().default("approved"),
    confirmationsCount: integer("confirmations_count").notNull().default(0),
    providerId: uuid("provider_id"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("places_city_idx").on(t.city), index("places_category_idx").on(t.categoryId)],
);

// ---------------------------------------------------------------------------
// Providers (marketplace businesses) & services
// ---------------------------------------------------------------------------
export const providers = pgTable(
  "providers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    categoryId: uuid("category_id").references(() => placeCategories.id, { onDelete: "set null" }),
    description: text("description"),
    city: varchar("city", { length: 120 }).notNull(),
    country: varchar("country", { length: 120 }).notNull(),
    address: text("address"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    phone: varchar("phone", { length: 40 }),
    email: varchar("email", { length: 255 }),
    website: text("website"),
    coverImageUrl: text("cover_image_url"),
    verificationStatus: providerVerificationEnum("verification_status").notNull().default("unverified"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("providers_owner_user_unique").on(t.ownerUserId),
    check(
      "providers_coordinate_pair_check",
      sql`((${t.lat} IS NULL AND ${t.lng} IS NULL) OR (${t.lat} IS NOT NULL AND ${t.lng} IS NOT NULL))`,
    ),
  ],
);

export const providerServices = pgTable(
  "provider_services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    category: bookingCategoryEnum("category").notNull().default("other"),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    priceAmount: numeric("price_amount", { precision: 10, scale: 2 }),
    priceCurrency: varchar("price_currency", { length: 3 }).notNull().default("USD"),
    durationMinutes: integer("duration_minutes"),
    capacity: integer("capacity"),
    isActive: boolean("is_active").notNull().default(true),
    coverImageUrl: text("cover_image_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("provider_services_price_amount_check", sql`${t.priceAmount} IS NULL OR (${t.priceAmount} >= 0 AND ${t.priceAmount} <= 1000000)`),
    check("provider_services_currency_check", sql`${t.priceCurrency} ~ '^[A-Z]{3}$'`),
    check("provider_services_duration_check", sql`${t.durationMinutes} IS NULL OR (${t.durationMinutes} >= 1 AND ${t.durationMinutes} <= 100000)`),
    check("provider_services_capacity_check", sql`${t.capacity} IS NULL OR (${t.capacity} >= 1 AND ${t.capacity} <= 10000)`),
  ],
);

// ---------------------------------------------------------------------------
// Media (polymorphic: ownerType = 'place' | 'provider' | 'review' | 'contribution')
// ---------------------------------------------------------------------------
export const media = pgTable("media", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerType: varchar("owner_type", { length: 40 }).notNull(),
  ownerId: uuid("owner_id").notNull(),
  url: text("url").notNull(),
  kind: mediaKindEnum("kind").notNull().default("image"),
  uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------
export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    placeId: uuid("place_id").references(() => places.id, { onDelete: "cascade" }),
    providerId: uuid("provider_id").references(() => providers.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    status: reviewStatusEnum("status").notNull().default("published"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("reviews_user_place_unique")
      .on(t.userId, t.placeId)
      .where(sql`${t.placeId} is not null`),
    uniqueIndex("reviews_user_provider_unique")
      .on(t.userId, t.providerId)
      .where(sql`${t.providerId} is not null`),
    check(
      "reviews_exactly_one_target_check",
      sql`((${t.placeId} IS NOT NULL) <> (${t.providerId} IS NOT NULL))`,
    ),
    check("reviews_rating_range_check", sql`${t.rating} BETWEEN 1 AND 5`),
  ],
);

// ---------------------------------------------------------------------------
// Community contributions (untrusted-until-confirmed knowledge system)
// ---------------------------------------------------------------------------
export const contributions = pgTable("contributions", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: contributionTypeEnum("type").notNull(),
  placeId: uuid("place_id").references(() => places.id, { onDelete: "cascade" }),
  payload: jsonb("payload").notNull(),
  submittedByUserId: uuid("submitted_by_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: contentStatusEnum("status").notNull().default("pending"),
  confirmationsCount: integer("confirmations_count").notNull().default(0),
  source: sourceTypeEnum("source").notNull().default("community"),
  reviewNote: text("review_note"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contributionConfirmations = pgTable(
  "contribution_confirmations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contributionId: uuid("contribution_id")
      .notNull()
      .references(() => contributions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("contribution_confirmation_unique").on(t.contributionId, t.userId)],
);

// ---------------------------------------------------------------------------
// Reports & moderation (polymorphic target)
// ---------------------------------------------------------------------------
export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    targetType: varchar("target_type", { length: 40 }).notNull(),
    targetId: uuid("target_id").notNull(),
    reason: varchar("reason", { length: 80 }).notNull(),
    details: text("details"),
    reportedByUserId: uuid("reported_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: reportStatusEnum("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("reports_user_target_unique").on(t.reportedByUserId, t.targetType, t.targetId)],
);

// ---------------------------------------------------------------------------
// Trips / itinerary
// ---------------------------------------------------------------------------
export const trips = pgTable(
  "trips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    guestId: varchar("guest_id", { length: 64 }),
    title: varchar("title", { length: 200 }).notNull(),
    destinationCity: varchar("destination_city", { length: 120 }).notNull(),
    destinationCountry: varchar("destination_country", { length: 120 }).notNull(),
    startDate: varchar("start_date", { length: 10 }).notNull(),
    endDate: varchar("end_date", { length: 10 }).notNull(),
    travelers: integer("travelers").notNull().default(1),
    budgetAmount: numeric("budget_amount", { precision: 10, scale: 2 }),
    budgetCurrency: varchar("budget_currency", { length: 3 }).notNull().default("USD"),
    travelStyle: varchar("travel_style", { length: 40 }),
    interests: jsonb("interests").$type<string[]>().notNull().default([]),
    notes: text("notes"),
    generatedBy: varchar("generated_by", { length: 20 }).notNull().default("manual"),
    status: tripStatusEnum("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("trips_user_idx").on(t.userId),
    index("trips_guest_idx").on(t.guestId),
    check(
      "trips_exactly_one_owner_check",
      sql`((${t.userId} IS NOT NULL) <> (${t.guestId} IS NOT NULL))`,
    ),
  ],
);

export const tripDays = pgTable(
  "trip_days",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    dayIndex: integer("day_index").notNull(),
    date: varchar("date", { length: 10 }).notNull(),
    notes: text("notes"),
  },
  (t) => [unique("trip_days_trip_day_unique").on(t.tripId, t.dayIndex)],
);

export const itineraryItems = pgTable(
  "itinerary_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripDayId: uuid("trip_day_id")
      .notNull()
      .references(() => tripDays.id, { onDelete: "cascade" }),
    placeId: uuid("place_id").references(() => places.id, { onDelete: "set null" }),
    title: varchar("title", { length: 200 }).notNull(),
    category: varchar("category", { length: 40 }).notNull().default("activity"),
    startTime: varchar("start_time", { length: 5 }),
    endTime: varchar("end_time", { length: 5 }),
    estimatedCost: numeric("estimated_cost", { precision: 10, scale: 2 }),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    notes: text("notes"),
    status: itineraryStatusEnum("status").notNull().default("suggested"),
    bookingId: uuid("booking_id"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("itinerary_items_trip_day_idx").on(t.tripDayId)],
);

// ---------------------------------------------------------------------------
// Favorites (polymorphic target: 'place' | 'provider')
// ---------------------------------------------------------------------------
export const favorites = pgTable(
  "favorites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetType: varchar("target_type", { length: 20 }).notNull(),
    targetId: uuid("target_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("favorites_user_target_unique").on(t.userId, t.targetType, t.targetId)],
);

// ---------------------------------------------------------------------------
// Bookings & payments
// ---------------------------------------------------------------------------
export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    guestId: varchar("guest_id", { length: 64 }),
    providerId: uuid("provider_id").references(() => providers.id, { onDelete: "set null" }),
    serviceId: uuid("service_id").references(() => providerServices.id, { onDelete: "set null" }),
    itineraryItemId: uuid("itinerary_item_id").references(() => itineraryItems.id, { onDelete: "set null" }),
    category: bookingCategoryEnum("category").notNull(),
    status: bookingStatusEnum("status").notNull().default("draft"),
    startDate: varchar("start_date", { length: 10 }),
    endDate: varchar("end_date", { length: 10 }),
    guestsCount: integer("guests_count").notNull().default(1),
    totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull().default("0"),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    idempotencyKey: varchar("idempotency_key", { length: 100 }).notNull().unique(),
    contactName: varchar("contact_name", { length: 120 }),
    contactEmail: varchar("contact_email", { length: 255 }),
    contactPhone: varchar("contact_phone", { length: 40 }),
    notes: text("notes"),
    cancelledReason: text("cancelled_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("bookings_user_idx").on(t.userId),
    index("bookings_provider_idx").on(t.providerId),
    uniqueIndex("bookings_active_itinerary_item_unique")
      .on(t.itineraryItemId)
      .where(sql`${t.itineraryItemId} is not null and ${t.status} in ('draft', 'pending', 'awaiting_payment', 'confirmed')`),
    check(
      "bookings_owner_exclusive_check",
      sql`NOT (${t.userId} IS NOT NULL AND ${t.guestId} IS NOT NULL)`,
    ),
    check("bookings_guests_count_check", sql`${t.guestsCount} BETWEEN 1 AND 50`),
    check("bookings_total_amount_check", sql`${t.totalAmount} >= 0 AND ${t.totalAmount} <= 99999999.99`),
    check("bookings_currency_check", sql`${t.currency} ~ '^[A-Z]{3}$'`),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    provider: paymentProviderEnum("provider").notNull(),
    providerRef: varchar("provider_ref", { length: 200 }),
    status: paymentStatusEnum("status").notNull().default("requires_payment"),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    isTestMode: boolean("is_test_mode").notNull().default(true),
    idempotencyKey: varchar("idempotency_key", { length: 100 }).notNull().unique(),
    rawPayload: jsonb("raw_payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("payments_booking_idx").on(t.bookingId),
    uniqueIndex("payments_provider_ref_unique")
      .on(t.provider, t.providerRef)
      .where(sql`${t.providerRef} is not null`),
    uniqueIndex("payments_active_booking_unique")
      .on(t.bookingId)
      .where(sql`${t.status} in ('requires_payment', 'processing', 'succeeded')`),
    check("payments_amount_check", sql`${t.amount} > 0 AND ${t.amount} <= 99999999.99`),
    check("payments_currency_check", sql`${t.currency} ~ '^[A-Z]{3}$'`),
  ],
);

// ---------------------------------------------------------------------------
// Sindbad AI conversations
// ---------------------------------------------------------------------------
export const aiConversations = pgTable(
  "ai_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    guestId: varchar("guest_id", { length: 64 }),
    title: varchar("title", { length: 200 }).notNull().default("New conversation"),
    context: jsonb("context"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "ai_conversations_exactly_one_owner_check",
      sql`((${t.userId} IS NOT NULL) <> (${t.guestId} IS NOT NULL))`,
    ),
  ],
);

export const aiMessages = pgTable(
  "ai_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => aiConversations.id, { onDelete: "cascade" }),
    role: aiRoleEnum("role").notNull(),
    content: text("content").notNull(),
    toolCalls: jsonb("tool_calls"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_messages_conversation_idx").on(t.conversationId)],
);

// ---------------------------------------------------------------------------
// Sponsored content (advertising foundation)
// ---------------------------------------------------------------------------
export const sponsoredPlacements = pgTable("sponsored_placements", {
  id: uuid("id").primaryKey().defaultRandom(),
  targetType: varchar("target_type", { length: 20 }).notNull(),
  targetId: uuid("target_id").notNull(),
  label: varchar("label", { length: 60 }).notNull().default("Sponsored"),
  placement: varchar("placement", { length: 40 }).notNull().default("home_feed"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  priority: integer("priority").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
