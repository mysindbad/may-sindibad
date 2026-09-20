import { isoDateDifferenceDays, parseIsoDateStrict } from "./date";

export type BookingCategory = "hotel" | "restaurant" | "activity" | "tour" | "vehicle" | "boat" | "transfer" | "other";

export const MAX_STORED_BOOKING_TOTAL = 99_999_999.99; // numeric(10,2)

export interface BookingPricingInput {
  category: BookingCategory;
  unitPrice: number;
  guestsCount: number;
  startDate?: string | null;
  endDate?: string | null;
}

export function isSupportedBookingTotal(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= MAX_STORED_BOOKING_TOTAL;
}

export function bookingDurationDays(startDate?: string | null, endDate?: string | null): number {
  const start = parseIsoDateStrict(startDate);
  const end = parseIsoDateStrict(endDate);
  if (!start || !end) return 1;
  const diff = Math.ceil((end.getTime() - start.getTime()) / 86_400_000);
  return Math.max(1, diff);
}

export function validateBookingDates(category: BookingCategory, startDate?: string | null, endDate?: string | null): string | null {
  const start = parseIsoDateStrict(startDate);
  const end = parseIsoDateStrict(endDate);

  if ((startDate && !start) || (endDate && !end)) return "Invalid booking date.";
  if (end && !start) return "A start date is required when an end date is provided.";
  if (start && end && end.getTime() < start.getTime()) return "End date must be on or after the start date.";

  // A real booking request needs a concrete service date. "other" remains
  // flexible for quote-style services that a provider may schedule manually.
  if (category !== "other" && !start) return "This service requires a booking date.";

  if (["hotel", "vehicle", "boat"].includes(category)) {
    if (!start || !end) return "This service requires both a start date and an end date.";
    const duration = isoDateDifferenceDays(startDate, endDate);
    if (duration === null) return "Invalid booking date.";
    if (category === "hotel" && duration < 1) return "Hotel checkout must be after the check-in date.";
    if (duration > 365) return "Booking duration cannot exceed 365 days.";
  }

  return null;
}

/**
 * Server-authoritative baseline pricing by service category.
 * This intentionally uses only provider-owned service price + validated booking inputs.
 * More advanced providers can later supply inventory/rate-plan adapters without changing callers.
 */
export function calculateBookingTotal(input: BookingPricingInput): number {
  const unitPrice = Number.isFinite(input.unitPrice) ? Math.max(0, input.unitPrice) : 0;
  const guests = Math.max(1, Math.trunc(input.guestsCount || 1));

  switch (input.category) {
    case "hotel":
    case "vehicle":
    case "boat":
      return roundMoney(unitPrice * bookingDurationDays(input.startDate, input.endDate));
    case "restaurant":
    case "activity":
    case "tour":
      return roundMoney(unitPrice * guests);
    case "transfer":
    case "other":
    default:
      return roundMoney(unitPrice);
  }
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
