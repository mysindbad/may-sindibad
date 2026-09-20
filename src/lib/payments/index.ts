import "server-only";
import type { PaymentProvider } from "./provider";
import { StripePaymentProvider } from "./stripe";
import { DemoPaymentProvider } from "./demo";

export { isPaymentsConfigured } from "./provider";
export type { PaymentSessionResult, PaymentProvider } from "./provider";

export function getPaymentProvider(): PaymentProvider | null {
  // A create-capable Stripe key is not sufficient: without the webhook secret
  // we cannot safely reconcile real payment outcomes into booking state.
  if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET) {
    return new StripePaymentProvider(process.env.STRIPE_SECRET_KEY);
  }
  if (process.env.NODE_ENV !== "production" && process.env.PAYMENTS_DEMO_MODE === "true") {
    return new DemoPaymentProvider();
  }
  return null;
}
