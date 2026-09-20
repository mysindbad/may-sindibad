import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { bookings, itineraryItems, payments } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { canTransition, type BookingStatus } from "@/lib/domain/booking-state-machine";
import { getPaymentProvider } from "@/lib/payments";
import { isUnauthenticatedError, jsonError } from "@/lib/api-utils";
import { isTrustedMutationRequest } from "@/lib/security/mutation-origin";
import { parseJsonBodyWithLimit } from "@/lib/http/bounded-body";
import { z } from "zod";
import { toUserBookingView } from "@/lib/bookings/user-view";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
    if (!booking) return jsonError("Booking not found.", 404);
    if (booking.userId !== user.id) return jsonError("You don't have permission to view this booking.", 403);
    return NextResponse.json({ booking: toUserBookingView(booking) });
  } catch (error) {
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    throw error;
  }
}

const patchSchema = z.object({
  status: z.enum(["cancelled"]),
  reason: z.string().max(500).optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isTrustedMutationRequest(request)) return jsonError("Request origin is not allowed.", 403);
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
    if (!booking) return jsonError("Booking not found.", 404);
    if (booking.userId !== user.id) return jsonError("You don't have permission to modify this booking.", 403);

    const json = await parseJsonBodyWithLimit(request);
    if (!json.ok) return jsonError("Request body is too large.", 413);
    const body = json.body;
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return jsonError("Invalid request.", 422);

    if (booking.status === "confirmed") {
      return jsonError("Confirmed bookings require the refund/cancellation workflow.", 409);
    }

    const nextStatus = parsed.data.status as BookingStatus;
    if (!canTransition(booking.status as BookingStatus, nextStatus)) {
      return jsonError(`Booking can't move from ${booking.status} to ${nextStatus}.`, 409);
    }

    // Never leave an open hosted checkout behind after a booking is cancelled.
    // Otherwise a customer could pay a cancelled booking from an old browser tab.
    if (booking.status === "awaiting_payment") {
      const openPayments = await db
        .select()
        .from(payments)
        .where(and(eq(payments.bookingId, booking.id), inArray(payments.status, ["requires_payment", "processing", "succeeded"])));

      if (openPayments.some((payment) => payment.status === "succeeded")) {
        return jsonError("Payment has already completed. Refresh before cancelling.", 409);
      }

      const provider = getPaymentProvider();
      for (const payment of openPayments) {
        if (!payment.providerRef || !provider || provider.id !== payment.provider || !provider.cancelPaymentSession) {
          return jsonError("The active payment session could not be safely cancelled. Try again after it expires or contact support.", 409);
        }
        const cancelled = await provider.cancelPaymentSession(payment.providerRef);
        if (!cancelled) return jsonError("Payment is already processing or completed. Refresh before cancelling.", 409);
      }

      if (openPayments.length > 0) {
        await db
          .update(payments)
          .set({ status: "failed", updatedAt: new Date() })
          .where(and(eq(payments.bookingId, booking.id), inArray(payments.status, ["requires_payment", "processing"])));
      }
    }

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(bookings)
        .set({ status: nextStatus, cancelledReason: parsed.data.reason, updatedAt: new Date() })
        .where(and(eq(bookings.id, id), eq(bookings.status, booking.status)))
        .returning();
      if (!row) return null;

      if (booking.itineraryItemId) {
        const [item] = await tx.select().from(itineraryItems).where(eq(itineraryItems.id, booking.itineraryItemId)).limit(1);
        if (item?.bookingId === booking.id) {
          await tx
            .update(itineraryItems)
            .set({ bookingId: null, status: item.status === "booked" ? "confirmed" : item.status })
            .where(eq(itineraryItems.id, booking.itineraryItemId));
        }
      }
      return row;
    });

    if (!updated) return jsonError("Booking changed while you were cancelling it. Refresh and try again.", 409);
    return NextResponse.json({ booking: toUserBookingView(updated) });
  } catch (error) {
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    throw error;
  }
}
