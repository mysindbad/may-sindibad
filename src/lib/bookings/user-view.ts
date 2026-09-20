/**
 * Data-minimized booking view for the traveler who owns a reservation.
 *
 * Client-facing booking APIs should not expose internal ownership / replay
 * identifiers such as userId, guestId or idempotencyKey. The traveler still
 * receives the service/provider/itinerary references needed by the product UI.
 */
export type UserBookingViewInput = {
  id: string;
  providerId: string | null;
  serviceId: string | null;
  itineraryItemId: string | null;
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

export function toUserBookingView(booking: UserBookingViewInput) {
  return {
    id: booking.id,
    providerId: booking.providerId,
    serviceId: booking.serviceId,
    itineraryItemId: booking.itineraryItemId,
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
