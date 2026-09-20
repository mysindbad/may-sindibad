import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { bookings, itineraryItems, providers } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { isUnauthenticatedError, jsonError, zodErrorResponse } from "@/lib/api-utils";
import { isTrustedMutationRequest } from "@/lib/security/mutation-origin";
import { parseJsonBodyWithLimit } from "@/lib/http/bounded-body";
import { checkRateLimit, clientKeyFromRequest } from "@/lib/rate-limit";
import { toProviderBookingView } from "@/lib/bookings/provider-view";

const bodySchema = z.object({ action: z.enum(["accept", "reject"]) });

class BookingItineraryLinkageError extends Error {}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isTrustedMutationRequest(request)) return jsonError("Request origin is not allowed.", 403);
  try {
    const user = await requireUser();
    const rate = await checkRateLimit(clientKeyFromRequest(request, `provider-booking:${user.id}`), 120, 60 * 60 * 1000);
    if (!rate.allowed) return jsonError("Too many booking changes. Please slow down.", 429);

    const json = await parseJsonBodyWithLimit(request);
    if (!json.ok) return jsonError("Request body is too large.", 413);
    const body = json.body;
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return zodErrorResponse(parsed.error);

    const { id } = await context.params;
    const [row] = await db
      .select({ booking: bookings, provider: providers })
      .from(bookings)
      .innerJoin(providers, eq(bookings.providerId, providers.id))
      .where(eq(bookings.id, id))
      .limit(1);

    if (!row) return jsonError("Booking not found.", 404);
    if (row.provider.ownerUserId !== user.id) return jsonError("You don't own this booking's provider listing.", 403);
    if (row.booking.status !== "pending") return jsonError("This booking has already been processed.", 409);

    if (parsed.data.action === "accept" && (!row.provider.isActive || row.provider.verificationStatus !== "verified")) {
      return jsonError("This provider is not currently eligible to accept bookings.", 409);
    }

    const nextStatus = parsed.data.action === "reject" ? "cancelled" : Number(row.booking.totalAmount) > 0 ? "awaiting_payment" : "confirmed";

    const result = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(bookings)
        .set({ status: nextStatus, updatedAt: new Date(), ...(nextStatus === "cancelled" ? { cancelledReason: "Rejected by provider" } : {}) })
        .where(and(eq(bookings.id, id), eq(bookings.status, "pending")))
        .returning();
      if (!updated) return null;

      if (updated.itineraryItemId) {
        if (nextStatus === "cancelled") {
          await tx
            .update(itineraryItems)
            .set({ bookingId: null })
            .where(and(eq(itineraryItems.id, updated.itineraryItemId), eq(itineraryItems.bookingId, updated.id)));
        } else if (nextStatus === "confirmed") {
          const [linkedItem] = await tx
            .update(itineraryItems)
            .set({ bookingId: updated.id, status: "booked" })
            .where(and(eq(itineraryItems.id, updated.itineraryItemId), eq(itineraryItems.bookingId, updated.id)))
            .returning({ id: itineraryItems.id });
          if (!linkedItem) throw new BookingItineraryLinkageError();
        }
      }
      return updated;
    });

    if (!result) return jsonError("Booking changed while you were reviewing it. Refresh and try again.", 409);
    return NextResponse.json({ booking: toProviderBookingView(result) });
  } catch (error) {
    if (error instanceof BookingItineraryLinkageError) {
      return jsonError("This booking is no longer linked to the expected itinerary activity. Refresh before accepting it.", 409);
    }
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    throw error;
  }
}
