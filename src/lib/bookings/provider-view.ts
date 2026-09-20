/**
 * Data-minimized booking view for a provider fulfilling a reservation.
 *
 * Provider-facing APIs must never expose account/session/internal linkage such
 * as userId, guestId, itineraryItemId or idempotencyKey. Those identifiers are
 * useful to My Sindbad internally, not to the business fulfilling the booking.
 */
export type ProviderBookingViewInput = {
  id: string;
  category: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  guestsCount: number;
  totalAmount: string;
  currency: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  notes: string | null;
  cancelledReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function toProviderBookingView(booking: ProviderBookingViewInput) {
  return {
    id: booking.id,
    category: booking.category,
    status: booking.status,
    startDate: booking.startDate,
    endDate: booking.endDate,
    guestsCount: booking.guestsCount,
    totalAmount: booking.totalAmount,
    currency: booking.currency,
    contactName: booking.contactName,
    contactEmail: booking.contactEmail,
    contactPhone: booking.contactPhone,
    notes: booking.notes,
    cancelledReason: booking.cancelledReason,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
  };
}
