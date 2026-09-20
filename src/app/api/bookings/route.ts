import { NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { bookings, providerServices, providers, itineraryItems } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { bookingCreateSchema } from "@/lib/validation";
import { isUnauthenticatedError, jsonError, zodErrorResponse } from "@/lib/api-utils";
import { isTrustedMutationRequest } from "@/lib/security/mutation-origin";
import { parseJsonBodyWithLimit } from "@/lib/http/bounded-body";
import { checkRateLimit, clientKeyFromRequest } from "@/lib/rate-limit";
import { calculateBookingTotal, isSupportedBookingTotal, validateBookingDates } from "@/lib/domain/booking-pricing";
import { userOwnsItineraryItem } from "@/lib/trips/itinerary-ownership";
import { dateKeyInTimeZone, getRequestTimeZone } from "@/lib/timezone";
import { toUserBookingView } from "@/lib/bookings/user-view";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const rows = await db.select().from(bookings).where(eq(bookings.userId, user.id)).orderBy(desc(bookings.createdAt));
    return NextResponse.json({ bookings: rows.map(toUserBookingView) });
  } catch (error) {
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    throw error;
  }
}

// Bookings are authenticated and priced only from server-owned service data.
// Client-provided category/provider/itinerary references are treated as claims
// that must be verified before anything is persisted.
export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return jsonError("Request origin is not allowed.", 403);
  try {
    const user = await requireUser();
    const rate = await checkRateLimit(clientKeyFromRequest(request, `booking:${user.id}`), 20, 60 * 60 * 1000);
    if (!rate.allowed) return jsonError("Too many booking attempts. Please slow down.", 429);

    const json = await parseJsonBodyWithLimit(request);
    if (!json.ok) return jsonError("Request body is too large.", 413);
    const body = json.body;
    const parsed = bookingCreateSchema.safeParse(body);
    if (!parsed.success) return zodErrorResponse(parsed.error);
    const data = parsed.data;

    const existing = await db.select().from(bookings).where(eq(bookings.idempotencyKey, data.idempotencyKey)).limit(1);
    if (existing.length > 0) {
      if (existing[0].userId !== user.id) return jsonError("Idempotency key is already in use.", 409);
      return NextResponse.json({ booking: toUserBookingView(existing[0]), duplicate: true });
    }

    const [serviceRow] = await db
      .select({ service: providerServices, provider: providers })
      .from(providerServices)
      .innerJoin(providers, eq(providerServices.providerId, providers.id))
      .where(and(eq(providerServices.id, data.serviceId), eq(providers.id, data.providerId)))
      .limit(1);

    if (!serviceRow) return jsonError("Service not found for this provider.", 404);
    const { service, provider } = serviceRow;
    if (!service.isActive || !provider.isActive) return jsonError("This service is not currently bookable.", 409);
    if (provider.verificationStatus !== "verified") return jsonError("This provider is not verified for bookings yet.", 409);
    if (service.category !== data.category) return jsonError("Booking category does not match the selected service.", 422);
    if (service.priceAmount === null) return jsonError("This service does not have a bookable price yet.", 409);
    if (service.capacity && data.guestsCount > service.capacity) return jsonError("Guest count exceeds this service's capacity.", 409);

    const dateError = validateBookingDates(service.category, data.startDate, data.endDate);
    if (dateError) return jsonError(dateError, 422);
    const today = dateKeyInTimeZone(new Date(), await getRequestTimeZone());
    if (data.startDate && data.startDate < today) return jsonError("Booking date cannot be in the past.", 422);

    if (data.itineraryItemId && !(await userOwnsItineraryItem(user.id, data.itineraryItemId))) {
      return jsonError("You don't have permission to attach this booking to that itinerary item.", 403);
    }

    if (data.itineraryItemId) {
      const activeForItem = await db
        .select({ id: bookings.id })
        .from(bookings)
        .where(
          and(
            eq(bookings.itineraryItemId, data.itineraryItemId),
            inArray(bookings.status, ["draft", "pending", "awaiting_payment", "confirmed"]),
          ),
        )
        .limit(1);
      if (activeForItem.length > 0) return jsonError("This itinerary item already has an active booking.", 409);
    }

    const totalAmount = calculateBookingTotal({
      category: service.category,
      unitPrice: Number(service.priceAmount ?? 0),
      guestsCount: data.guestsCount,
      startDate: data.startDate,
      endDate: data.endDate,
    });
    if (!isSupportedBookingTotal(totalAmount)) {
      return jsonError("This booking total exceeds the supported amount. Contact the provider for a custom quote.", 422);
    }

    let booking;
    try {
      booking = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(bookings)
          .values({
            userId: user.id,
            providerId: provider.id,
            serviceId: service.id,
            itineraryItemId: data.itineraryItemId ?? null,
            category: service.category,
            status: "pending",
            startDate: data.startDate,
            endDate: data.endDate,
            guestsCount: data.guestsCount,
            totalAmount: totalAmount.toFixed(2),
            currency: service.priceCurrency.toUpperCase(),
            idempotencyKey: data.idempotencyKey,
            contactName: data.contactName,
            contactEmail: data.contactEmail,
            contactPhone: data.contactPhone,
            notes: data.notes,
          })
          .returning();

        if (data.itineraryItemId) {
          await tx
            .update(itineraryItems)
            .set({ bookingId: created.id })
            .where(eq(itineraryItems.id, data.itineraryItemId));
        }
        return created;
      });
    } catch (error) {
      // Resolve concurrent duplicate submissions safely using the database's
      // unique idempotency key rather than leaking an internal error.
      const [racedBooking] = await db.select().from(bookings).where(eq(bookings.idempotencyKey, data.idempotencyKey)).limit(1);
      if (racedBooking) {
        if (racedBooking.userId !== user.id) return jsonError("Idempotency key is already in use.", 409);
        return NextResponse.json({ booking: toUserBookingView(racedBooking), duplicate: true });
      }
      if (data.itineraryItemId) {
        const [racedItemBooking] = await db
          .select({ id: bookings.id })
          .from(bookings)
          .where(
            and(
              eq(bookings.itineraryItemId, data.itineraryItemId),
              inArray(bookings.status, ["draft", "pending", "awaiting_payment", "confirmed"]),
            ),
          )
          .limit(1);
        if (racedItemBooking) return jsonError("This itinerary item already has an active booking.", 409);
      }
      throw error;
    }

    return NextResponse.json({ booking: toUserBookingView(booking), duplicate: false }, { status: 201 });
  } catch (error) {
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    throw error;
  }
}
