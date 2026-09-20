export type PaymentStatus = "requires_payment" | "processing" | "succeeded" | "failed" | "refunded";

const ORDER: Record<PaymentStatus, number> = {
  requires_payment: 0,
  processing: 1,
  failed: 1,
  succeeded: 2,
  refunded: 3,
};

/**
 * Webhook events can arrive more than once or out of order. Never let a stale
 * processing/failed event downgrade a payment already known to have succeeded,
 * and never move a refunded payment backwards.
 */
export function resolvePaymentStatus(current: PaymentStatus, incoming: PaymentStatus): PaymentStatus {
  if (current === "refunded") return "refunded";
  if (current === "succeeded" && incoming !== "refunded") return "succeeded";
  if (incoming === "refunded") return current === "succeeded" ? "refunded" : current;
  if (incoming === "succeeded") return "succeeded";

  // processing and failed are both non-terminal pre-success states. Preserve
  // the newest signal instead of pretending either is stronger than success.
  if (ORDER[incoming] >= ORDER[current]) return incoming;
  return current;
}

/**
 * Current database states that may be atomically overwritten by an incoming
 * provider event. Keeping this rule next to resolvePaymentStatus prevents a
 * concurrent stale webhook from passing an old in-memory status check and
 * downgrading a payment that another request has already completed.
 */
export function mutablePaymentStatusesForIncoming(incoming: PaymentStatus): PaymentStatus[] {
  switch (incoming) {
    case "succeeded":
      return ["requires_payment", "processing", "failed", "succeeded"];
    case "processing":
    case "failed":
      return ["requires_payment", "processing", "failed"];
    case "refunded":
      return ["succeeded", "refunded"];
    case "requires_payment":
      return ["requires_payment"];
  }
}
