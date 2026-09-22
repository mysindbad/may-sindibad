import "server-only";
import type { PaymentProvider } from "./provider";
import { StripePaymentProvider } from "./stripe";
import { DemoPaymentProvider } from "./demo";

export { isPaymentsConfigured } from "./provider";
export type { PaymentSessionResult, PaymentProvider } from "./provider";

/**
 * Which payment provider this deployment uses.
 *
 * PAYMENTS_PROVIDER names the choice explicitly, so the merchant account can
 * be decided later without touching product code: the rest of the app only
 * ever talks to the PaymentProvider interface, and the payments table already
 * records which provider handled each row. Left unset, the resolver falls back
 * to whatever is actually configured, which keeps existing deployments working.
 *
 * Adding a provider is one adapter file plus one case here — bookings,
 * itineraries and the marketplace need no changes.
 */
export function getPaymentProvider(): PaymentProvider | null {
  const requested = (process.env.PAYMENTS_PROVIDER ?? "").trim().toLowerCase();

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const stripeReady = Boolean(stripeKey && process.env.STRIPE_WEBHOOK_SECRET);
  const demoAllowed = process.env.NODE_ENV !== "production" && process.env.PAYMENTS_DEMO_MODE === "true";

  if (requested === "stripe") {
    // A create-capable key is not sufficient: without the webhook secret we
    // cannot reconcile real outcomes back into booking state, which would mean
    // taking money we could not confirm.
    return stripeReady && stripeKey ? new StripePaymentProvider(stripeKey) : null;
  }
  if (requested === "demo") {
    return demoAllowed ? new DemoPaymentProvider() : null;
  }
  if (requested) {
    // A provider was named but has no adapter compiled in. Reporting "not
    // configured" is the honest answer; silently using a different provider
    // than the one the operator chose is not.
    return null;
  }

  if (stripeReady && stripeKey) return new StripePaymentProvider(stripeKey);
  if (demoAllowed) return new DemoPaymentProvider();
  return null;
}
