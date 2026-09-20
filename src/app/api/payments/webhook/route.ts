import { NextResponse } from "next/server";
import Stripe from "stripe";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { payments, bookings, itineraryItems } from "@/db/schema";
import { jsonError } from "@/lib/api-utils";
import { readRequestBodyWithLimit, RequestBodyTooLargeError } from "@/lib/http/bounded-body";
import { mutablePaymentStatusesForIncoming, type PaymentStatus } from "@/lib/domain/payment-state-machine";
import { toStripeMinorUnits } from "@/lib/payments/currency";

export async function POST(request: Request) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secretKey || !webhookSecret) return jsonError("Stripe webhooks are not configured in this environment.", 501);

  const signature = request.headers.get("stripe-signature");
  if (!signature) return jsonError("Missing Stripe signature.", 400);

  let rawBody: Uint8Array;
  try {
    // Preserve the exact raw bytes Stripe signed while preventing an oversized
    // webhook from being buffered into memory before signature verification.
    rawBody = await readRequestBodyWithLimit(request, 2 * 1024 * 1024);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return jsonError("Webhook payload is too large.", 413);
    throw error;
  }

  const stripe = new Stripe(secretKey);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(Buffer.from(rawBody), signature, webhookSecret);
  } catch {
    return jsonError("Webhook signature verification failed.", 400);
  }

  const supported = new Set([
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
    "checkout.session.async_payment_failed",
    "checkout.session.expired",
  ]);
  if (supported.has(event.type)) {
    const session = event.data.object as Stripe.Checkout.Session;
    const [payment] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.provider, "stripe"), eq(payments.providerRef, session.id)))
      .limit(1);
    if (payment) {
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, payment.bookingId)).limit(1);
      if (!booking || session.metadata?.bookingId !== booking.id) {
        console.error("Stripe webhook booking metadata mismatch", { paymentId: payment.id, providerRef: session.id });
        return jsonError("Payment booking metadata mismatch.", 409);
      }

      let expectedAmount: number;
      try {
        expectedAmount = toStripeMinorUnits(Number(payment.amount), payment.currency);
      } catch (error) {
        console.error("Stored payment amount cannot be represented safely for Stripe", { paymentId: payment.id, error });
        return jsonError("Stored payment amount is invalid.", 409);
      }
      const receivedAmount = session.amount_total;
      const expectedCurrency = payment.currency.toLowerCase();
      const receivedCurrency = session.currency?.toLowerCase();
      if (receivedAmount !== expectedAmount || receivedCurrency !== expectedCurrency) {
        console.error("Stripe webhook amount/currency mismatch", {
          paymentId: payment.id,
          expectedAmount,
          receivedAmount,
          expectedCurrency,
          receivedCurrency,
        });
        return jsonError("Payment amount or currency mismatch.", 409);
      }

      const paid =
        event.type !== "checkout.session.async_payment_failed" &&
        event.type !== "checkout.session.expired" &&
        session.payment_status === "paid";
      const incomingStatus: PaymentStatus = paid
        ? "succeeded"
        : event.type === "checkout.session.async_payment_failed" || event.type === "checkout.session.expired"
          ? "failed"
          : "processing";

      const result = await db.transaction(async (tx) => {
        // The status predicate is the concurrency guard. A stale failed or
        // processing event can never overwrite a row that a parallel success
        // event has already moved to succeeded/refunded.
        const [statusUpdated] = await tx
          .update(payments)
          .set({ status: incomingStatus, updatedAt: new Date() })
          .where(
            and(
              eq(payments.id, payment.id),
              inArray(payments.status, mutablePaymentStatusesForIncoming(incomingStatus)),
            ),
          )
          .returning();

        const effectivePayment =
          statusUpdated ??
          (await tx.select().from(payments).where(eq(payments.id, payment.id)).limit(1))[0];
        if (!effectivePayment) throw new Error("PAYMENT_DISAPPEARED_DURING_WEBHOOK");

        let effectiveBooking = (await tx.select().from(bookings).where(eq(bookings.id, booking.id)).limit(1))[0];
        if (!effectiveBooking) throw new Error("BOOKING_DISAPPEARED_DURING_WEBHOOK");

        let itineraryLinkageMismatch = false;
        if (effectivePayment.status === "succeeded") {
          // Confirm only from awaiting_payment. This database predicate, not a
          // stale in-memory transition check, prevents a concurrent cancellation
          // from being resurrected by a late webhook.
          const [confirmed] = await tx
            .update(bookings)
            .set({ status: "confirmed", updatedAt: new Date() })
            .where(and(eq(bookings.id, booking.id), eq(bookings.status, "awaiting_payment")))
            .returning();
          if (confirmed) effectiveBooking = confirmed;
          else effectiveBooking = (await tx.select().from(bookings).where(eq(bookings.id, booking.id)).limit(1))[0] ?? effectiveBooking;

          // A duplicate success webhook must be able to repair a stale
          // itinerary status after a prior partial/aborted application-level
          // attempt. Conversely, never silently claim success if the booking
          // points at an itinerary item that is no longer linked to this exact
          // booking. External payment has already succeeded at this point, so
          // record the mismatch for reconciliation instead of rolling it back.
          if (effectiveBooking.itineraryItemId && effectiveBooking.status === "confirmed") {
            const [linkedItem] = await tx
              .update(itineraryItems)
              .set({ bookingId: effectiveBooking.id, status: "booked" })
              .where(
                and(
                  eq(itineraryItems.id, effectiveBooking.itineraryItemId),
                  eq(itineraryItems.bookingId, effectiveBooking.id),
                ),
              )
              .returning({ id: itineraryItems.id });
            itineraryLinkageMismatch = !linkedItem;
          }
        }

        const paidBookingStateMismatch =
          effectivePayment.status === "succeeded" && !["confirmed", "completed"].includes(effectiveBooking.status);
        const reconciliationRequired = paidBookingStateMismatch || itineraryLinkageMismatch;
        const previousPayload = effectivePayment.rawPayload && typeof effectivePayment.rawPayload === "object" ? effectivePayment.rawPayload : {};
        await tx
          .update(payments)
          .set({
            updatedAt: new Date(),
            rawPayload: {
              ...previousPayload,
              eventId: event.id,
              checkoutSessionId: session.id,
              paymentStatus: session.payment_status,
              incomingStatus,
              resolvedStatus: effectivePayment.status,
              itineraryLinkageMismatch,
              reconciliationRequired,
            },
          })
          .where(eq(payments.id, payment.id));

        return {
          reconciliationRequired,
          itineraryLinkageMismatch,
          paymentStatus: effectivePayment.status,
          bookingStatus: effectiveBooking.status,
        };
      });

      const reconciliationRequired = result.reconciliationRequired;
      if (reconciliationRequired) {
        console.error("Paid Stripe session requires booking reconciliation.", {
          bookingId: booking.id,
          paymentId: payment.id,
          providerRef: session.id,
          bookingStatus: result.bookingStatus,
          itineraryLinkageMismatch: result.itineraryLinkageMismatch,
        });
      }
    }
  }

  return NextResponse.json({ received: true });
}
