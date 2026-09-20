import { describe, expect, it } from "vitest";
import { toStripeMinorUnits } from "../src/lib/payments/currency";

describe("Stripe currency amount conversion", () => {
  it("converts ordinary two-decimal currencies to minor units", () => {
    expect(toStripeMinorUnits(10.99, "USD")).toBe(1099);
    expect(toStripeMinorUnits(125.5, "MAD")).toBe(12550);
  });

  it("keeps zero-decimal charge currencies in major units", () => {
    expect(toStripeMinorUnits(500, "JPY")).toBe(500);
    expect(() => toStripeMinorUnits(500.5, "JPY")).toThrow(/fractional/i);
  });

  it("handles Stripe's ISK and UGX charge compatibility rule", () => {
    expect(toStripeMinorUnits(5, "ISK")).toBe(500);
    expect(toStripeMinorUnits(5, "UGX")).toBe(500);
    expect(() => toStripeMinorUnits(5.5, "UGX")).toThrow(/fractional/i);
  });

  it("rejects more precision than Stripe can represent", () => {
    expect(() => toStripeMinorUnits(10.999, "USD")).toThrow(/two decimal/i);
  });
});
