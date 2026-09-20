import { describe, expect, it } from "vitest";
import { isValidGuestId } from "../src/lib/auth/guest-id";

describe("guest id validation", () => {
  it("accepts only the server-issued guest UUID format", () => {
    expect(isValidGuestId("guest_550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isValidGuestId("guest_550e8400-e29b-11d4-a716-446655440000")).toBe(false);
    expect(isValidGuestId("guest_not-a-uuid")).toBe(false);
    expect(isValidGuestId("x".repeat(200))).toBe(false);
    expect(isValidGuestId(undefined)).toBe(false);
  });
});
