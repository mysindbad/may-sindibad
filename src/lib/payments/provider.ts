// Payment-provider abstraction. Card data never passes through our server.
// Providers return a hosted redirect URL or a client secret handled by their
// official UI. If no provider is configured the API reports that honestly.
export interface PaymentSessionResult {
  provider: "stripe" | "paypal" | "cashplus" | "demo";
  providerRef: string;
  redirectUrl: string | null;
  clientSecret: string | null;
  status: "requires_payment" | "processing" | "succeeded" | "failed";
  isTestMode: boolean;
}

export interface PaymentProvider {
  readonly id: "stripe" | "paypal" | "cashplus" | "demo";
  createPaymentSession(input: {
    amount: number;
    currency: string;
    bookingId: string;
    idempotencyKey: string;
    successUrl: string;
    cancelUrl: string;
    description: string;
  }): Promise<PaymentSessionResult>;

  /** Cancel an unpaid hosted payment session when the provider supports it. */
  cancelPaymentSession?(providerRef: string): Promise<boolean>;
}

export function isPaymentsConfigured(): boolean {
  // Checkout must never be offered when we cannot authenticate the webhook
  // that drives the authoritative succeeded/failed state back into bookings.
  // A Stripe API key by itself can create a real hosted payment that this app
  // would then be unable to reconcile safely.
  if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET) return true;
  // The demo adapter is a local QA aid only. Never let a production process
  // advertise payments as configured solely because this flag was copied by mistake.
  return process.env.NODE_ENV !== "production" && process.env.PAYMENTS_DEMO_MODE === "true";
}
