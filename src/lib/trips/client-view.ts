/**
 * Client-safe trip projection.
 *
 * `guestId` is an opaque ownership credential for guest data and must stay in
 * the HttpOnly cookie/server boundary. `userId` is also unnecessary in an API
 * response for a trip whose ownership was already authorized server-side.
 */
export type ClientTripViewInput = {
  id: string;
  title: string;
  destinationCity: string;
  destinationCountry: string;
  startDate: string;
  endDate: string;
  travelers: number;
  budgetAmount: string | null;
  budgetCurrency: string;
  travelStyle: string | null;
  interests: string[];
  notes: string | null;
  generatedBy: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

export function toClientTripView(trip: ClientTripViewInput) {
  return {
    id: trip.id,
    title: trip.title,
    destinationCity: trip.destinationCity,
    destinationCountry: trip.destinationCountry,
    startDate: trip.startDate,
    endDate: trip.endDate,
    travelers: trip.travelers,
    budgetAmount: trip.budgetAmount,
    budgetCurrency: trip.budgetCurrency,
    travelStyle: trip.travelStyle,
    interests: trip.interests,
    notes: trip.notes,
    generatedBy: trip.generatedBy,
    status: trip.status,
    createdAt: trip.createdAt,
    updatedAt: trip.updatedAt,
  };
}
