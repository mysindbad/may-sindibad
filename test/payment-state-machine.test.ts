import { describe, expect, it } from "vitest";
import { mutablePaymentStatusesForIncoming, resolvePaymentStatus } from "../src/lib/domain/payment-state-machine";

describe("payment webhook status resolution", () => {
  it("never downgrades a succeeded payment because of a stale failed event", () => {
    expect(resolvePaymentStatus("succeeded", "failed")).toBe("succeeded");
    expect(resolvePaymentStatus("succeeded", "processing")).toBe("succeeded");
    expect(mutablePaymentStatusesForIncoming("failed")).not.toContain("succeeded");
    expect(mutablePaymentStatusesForIncoming("processing")).not.toContain("succeeded");
  });

  it("allows a delayed success to upgrade processing or failed", () => {
    expect(resolvePaymentStatus("processing", "succeeded")).toBe("succeeded");
    expect(resolvePaymentStatus("failed", "succeeded")).toBe("succeeded");
    expect(mutablePaymentStatusesForIncoming("succeeded")).toContain("processing");
    expect(mutablePaymentStatusesForIncoming("succeeded")).toContain("failed");
  });

  it("does not move a refunded payment backwards", () => {
    expect(resolvePaymentStatus("refunded", "succeeded")).toBe("refunded");
    expect(mutablePaymentStatusesForIncoming("succeeded")).not.toContain("refunded");
  });
});
