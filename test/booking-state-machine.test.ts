import { describe, expect, it } from "vitest";
import { canTransition } from "../src/lib/domain/booking-state-machine";

describe("booking lifecycle", () => {
  it("allows normal payment confirmation flow", () => {
    expect(canTransition("pending", "awaiting_payment")).toBe(true);
    expect(canTransition("awaiting_payment", "confirmed")).toBe(true);
  });

  it("prevents late webhooks from resurrecting cancelled bookings", () => {
    expect(canTransition("cancelled", "confirmed")).toBe(false);
  });
});
