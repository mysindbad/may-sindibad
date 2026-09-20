import { describe, expect, it } from "vitest";
import { bookingDurationDays, calculateBookingTotal, validateBookingDates } from "../src/lib/domain/booking-pricing";

describe("booking pricing", () => {
  it("does not trust guest count for flat transfers", () => {
    expect(calculateBookingTotal({ category: "transfer", unitPrice: 120, guestsCount: 4 })).toBe(120);
  });

  it("prices per-person activities", () => {
    expect(calculateBookingTotal({ category: "activity", unitPrice: 25, guestsCount: 3 })).toBe(75);
  });

  it("prices hotel nights from date duration", () => {
    expect(bookingDurationDays("2026-09-20", "2026-09-23")).toBe(3);
    expect(calculateBookingTotal({ category: "hotel", unitPrice: 100, guestsCount: 2, startDate: "2026-09-20", endDate: "2026-09-23" })).toBe(300);
  });

  it("requires both dates for duration-based services", () => {
    expect(validateBookingDates("vehicle", "2026-09-20", undefined)).toMatch(/requires both/i);
    expect(validateBookingDates("boat", "2026-09-22", "2026-09-20")).toMatch(/on or after/i);
  });

  it("rejects impossible dates and invalid hotel stays", () => {
    expect(validateBookingDates("hotel", "2026-02-31", "2026-03-02")).toMatch(/invalid/i);
    expect(validateBookingDates("hotel", "2026-09-20", "2026-09-20")).toMatch(/after the check-in/i);
  });

  it("caps unusually long duration bookings", () => {
    expect(validateBookingDates("vehicle", "2026-01-01", "2027-01-02")).toMatch(/365 days/i);
  });
});
