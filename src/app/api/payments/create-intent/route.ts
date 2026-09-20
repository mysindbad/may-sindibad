import { NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { bookings, payments, providerServices, providers } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { paymentIntentCreateSchema } from "@/lib/validation";
import { getPaymentProvider, isPaymentsConfigured } from "@/lib/payments";
import { isUnauthenticatedError, jsonError, zodErrorResponse } from "@/lib/api-utils";
import { isTrustedMutationRequest } from "@/lib/security/mutation-origin";
import { parseJsonBodyWithLimit } from "@/lib/http/bounded-body";
import { checkRateLimit, clientKeyFromRequest } from "@/lib/rate-limit";
import { getTrustedAppOrigin } from "@/lib/app-origin";
import { toClientPaymentView } from "@/lib/payments/client-view";

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return jsonError("Request origin is not allowed.", 403);
  try {
    const user = await requireUser();
    const rate = await checkRateLimit(clientKeyFromRequest(request, `payment:${user.id}`), 20, 60 * 60 * 1000);
    if (!rate.allowed) return jsonError("Too many payment attempts. Please slow down.", 429);

    const json = await parseJsonBodyWithLimit(request);
    if (!json.ok) return jsonError("Request body is too large.", 413);
    const body = json.body;
    const parsed = paymentIntentCreateSchema.safeParse(body);
    if (!parsed.success) return zodErrorResponse(parsed.error);

    const [booking] = await db.select().from(bookings).where(eq(bookings.id, parsed.data.bookingId)).limit(1);
    if (!booking) return jsonError("Booking not found.", 404);
    if (booking.userId !== user.id) return jsonError("You don't have permission to pay for this booking.", 403);
    if (booking.status !== "awaiting_payment") return jsonError("This booking is not ready for payment yet.", 409);
    if (Number(booking.totalAmount) <= 0) return jsonError("This booking has no payable amount.", 409);

    // Re-check bookability at the moment money is about to move. A provider can
    // be suspended or a service disabled after the original request was made.
    if (!booking.serviceId || !booking.providerId) return jsonError("Booking is missing its service provider.", 409);
    const [bookable] = booking.serviceId
      ? await db
          .select({ serviceActive: providerServices.isActive, providerActive: providers.isActive, verification: providers.verificationStatus, name: providerServices.name })
          .from(providerServices)
          .innerJoin(providers, eq(providerServices.providerId, providers.id))
          .where(and(eq(providerServices.id, booking.serviceId), eq(providers.id, booking.providerId)))
          .limit(1)
      : [];
    if (!bookable || !bookable.serviceActive || !bookable.providerActive || bookable.verification !== "verified") {
      return jsonError("This service is no longer available for payment.", 409);
    }

    const [sameKey] = await db.select().from(payments).where(eq(payments.idempotencyKey, parsed.data.idempotencyKey)).limit(1);
    if (sameKey) {
      if (sameKey.bookingId !== booking.id) return jsonError("Idempotency key is already in use.", 409);
      if (sameKey.status === "failed" || sameKey.status === "refunded") {
        return jsonError("The previous payment attempt is closed. Please try again.", 409, { code: "payment_attempt_closed" });
      }
      if (sameKey.status === "succeeded") return jsonError("This booking is already paid.", 409);
      return NextResponse.json(existingPaymentResponse(sameKey));
    }

    // A page refresh must not create a second hosted checkout for the same
    // booking merely because the browser generated a new idempotency key.
    const [existingForBooking] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.bookingId, booking.id), inArray(payments.status, ["requires_payment", "processing", "succeeded"])))
      .orderBy(desc(payments.createdAt))
      .limit(1);
    if (existingForBooking) {
      if (existingForBooking.status === "succeeded") return jsonError("This booking is already paid.", 409);
      return NextResponse.json(existingPaymentResponse(existingForBooking));
    }

    if (!isPaymentsConfigured()) {
      return NextResponse.json(
        { configured: false, message: "Payments are not configured in this environment yet. Your booking remains awaiting payment." },
        { status: 200 },
      );
    }

    const provider = getPaymentProvider();
    if (!provider) return jsonError("Payment provider unavailable.", 503);

    const origin = getTrustedAppOrigin(new URL(request.url).origin);
    if (!origin) return jsonError("The application's public origin is not configured for secure payments.", 503);
    const bookingUrl = `${origin}/${parsed.data.locale}/bookings/${booking.id}`;
    let session;
    try {
      session = await provider.createPaymentSession({
        amount: Number(booking.totalAmount),
        currency: booking.currency,
        bookingId: booking.id,
        idempotencyKey: parsed.data.idempotencyKey,
        successUrl: bookingUrl,
        cancelUrl: bookingUrl,
        description: bookable.name ?? "My Sindbad booking",
      });
    } catch (error) {
      console.error("Payment provider failed to create checkout session", {
        bookingId: booking.id,
        provider: provider.id,
        error: error instanceof Error ? error.message : "unknown_error",
      });
      return jsonError("Payment checkout could not be created. Please try again or contact support.", 502);
    }

    if (session.provider !== "demo" && !session.redirectUrl && !session.clientSecret) {
      // A provider may have created a hosted session even if its response is
      // incomplete for our client. Best-effort expire that unusable external
      // session so a malformed provider response cannot leave an orphan that
      // might later accept payment outside our database lifecycle.
      if (provider.cancelPaymentSession && session.providerRef) {
        await provider.cancelPaymentSession(session.providerRef).catch(() => false);
      }
      return jsonError("Payment provider returned no usable checkout session.", 502);
    }

    try {
      const [payment] = await db
        .insert(payments)
        .values({
          bookingId: booking.id,
          provider: session.provider,
          providerRef: session.providerRef,
          status: session.status,
          amount: booking.totalAmount,
          currency: booking.currency,
          isTestMode: session.isTestMode,
          idempotencyKey: parsed.data.idempotencyKey,
          rawPayload: { providerRef: session.providerRef, isTestMode: session.isTestMode, redirectUrl: session.redirectUrl },
        })
        .returning();

      return NextResponse.json({ configured: true, payment: toClientPaymentView(payment), redirectUrl: session.redirectUrl, clientSecret: session.clientSecret });
    } catch (error) {
      const [raced] = await db
        .select()
        .from(payments)
        .where(and(eq(payments.bookingId, booking.id), inArray(payments.status, ["requires_payment", "processing", "succeeded"])))
        .orderBy(desc(payments.createdAt))
        .limit(1);
      if (raced) {
        // Parallel requests with different browser idempotency keys can both
        // reach the payment provider before the DB's one-active-payment guard
        // picks a winner. Expire only the losing provider session; if Stripe
        // returned the same session for the same idempotency key, cancelling it
        // would cancel the authoritative checkout too.
        if (
          provider.cancelPaymentSession &&
          session.providerRef &&
          session.providerRef !== raced.providerRef
        ) {
          await provider.cancelPaymentSession(session.providerRef).catch(() => false);
        }
        return NextResponse.json(existingPaymentResponse(raced));
      }

      // If the database write failed after the hosted checkout was created,
      // best-effort expire that orphaned session so it cannot later collect money.
      if (provider.cancelPaymentSession) await provider.cancelPaymentSession(session.providerRef).catch(() => false);
      throw error;
    }
  } catch (error) {
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    throw error;
  }
}

function existingPaymentResponse(payment: typeof payments.$inferSelect) {
  const rawPayload = payment.rawPayload;
  const redirectUrl =
    rawPayload && typeof rawPayload === "object" && "redirectUrl" in rawPayload && typeof rawPayload.redirectUrl === "string"
      ? rawPayload.redirectUrl
      : null;
  return { configured: true, payment: toClientPaymentView(payment), duplicate: true, redirectUrl, clientSecret: null };
}
