import "server-only";
import Stripe from "stripe";
import type { PaymentProvider, PaymentSessionResult } from "./provider";
import { toStripeMinorUnits } from "./currency";

export class StripePaymentProvider implements PaymentProvider {
  readonly id = "stripe" as const;
  private readonly client: Stripe;

  constructor(secretKey: string) {
    this.client = new Stripe(secretKey, {
      // Stripe defaults to a long per-request timeout. Keep payment requests
      // bounded while allowing safe SDK retries; create calls also carry our
      // own idempotency key so transient retries cannot create a second charge.
      timeout: 20_000,
      maxNetworkRetries: 2,
    });
  }

  async createPaymentSession(input: {
    amount: number;
    currency: string;
    bookingId: string;
    idempotencyKey: string;
    successUrl: string;
    cancelUrl: string;
    description: string;
  }): Promise<PaymentSessionResult> {
    const unitAmount = toStripeMinorUnits(input.amount, input.currency);

    const session = await this.client.checkout.sessions.create(
      {
        mode: "payment",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: input.currency.toLowerCase(),
              unit_amount: unitAmount,
              product_data: { name: input.description.slice(0, 120) || "My Sindbad booking" },
            },
          },
        ],
        success_url: `${input.successUrl}${input.successUrl.includes("?") ? "&" : "?"}payment=success`,
        cancel_url: `${input.cancelUrl}${input.cancelUrl.includes("?") ? "&" : "?"}payment=cancelled`,
        metadata: { bookingId: input.bookingId, product: "my-sindbad" },
        payment_intent_data: { metadata: { bookingId: input.bookingId, product: "my-sindbad" } },
      },
      { idempotencyKey: `mysindbad:${input.idempotencyKey}` },
    );

    return {
      provider: "stripe",
      providerRef: session.id,
      redirectUrl: session.url,
      clientSecret: null,
      status: "requires_payment",
      isTestMode: secretKeyLooksLikeTestMode(),
    };
  }

  async cancelPaymentSession(providerRef: string): Promise<boolean> {
    if (!providerRef.startsWith("cs_")) return false;
    try {
      const session = await this.client.checkout.sessions.retrieve(providerRef);
      if (session.status === "expired") return true;
      if (session.status !== "open") return false;
      await this.client.checkout.sessions.expire(providerRef);
      return true;
    } catch {
      return false;
    }
  }
}

function secretKeyLooksLikeTestMode(): boolean {
  return (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_");
}
