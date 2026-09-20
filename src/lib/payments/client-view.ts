/**
 * Data-minimized payment view returned to the authenticated traveler.
 *
 * Provider references, raw webhook/session payloads and idempotency keys are
 * server-side reconciliation details and must not be serialized to browsers.
 */
export type ClientPaymentViewInput = {
  id: string;
  bookingId: string;
  provider: string;
  status: string;
  amount: string;
  currency: string;
  isTestMode: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export function toClientPaymentView(payment: ClientPaymentViewInput) {
  return {
    id: payment.id,
    bookingId: payment.bookingId,
    provider: payment.provider,
    status: payment.status,
    amount: payment.amount,
    currency: payment.currency,
    isTestMode: payment.isTestMode,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
  };
}
