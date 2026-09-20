import "server-only";
import { randomUUID } from "node:crypto";
import type { PaymentProvider, PaymentSessionResult } from "./provider";

// Explicit development-only provider. It never reports success and therefore
// cannot accidentally confirm a booking.
export class DemoPaymentProvider implements PaymentProvider {
  readonly id = "demo" as const;

  async createPaymentSession(_input: Parameters<PaymentProvider["createPaymentSession"]>[0]): Promise<PaymentSessionResult> {
    return {
      provider: "demo",
      providerRef: `demo_${randomUUID()}`,
      redirectUrl: null,
      clientSecret: null,
      status: "requires_payment",
      isTestMode: true,
    };
  }

  async cancelPaymentSession(_providerRef: string): Promise<boolean> {
    return true;
  }
}
