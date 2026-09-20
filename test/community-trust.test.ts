import { describe, expect, it } from "vitest";
import { contributionReadyForReview, evaluateContributionStatus } from "../src/lib/domain/community-trust";

describe("community trust", () => {
  it("never auto-approves pending community content from votes alone", () => {
    expect(evaluateContributionStatus({ confirmationsCount: 100, reportsCount: 0, currentStatus: "pending" })).toBe("pending");
    expect(contributionReadyForReview(3, 0)).toBe(true);
  });

  it("flags reported pending content", () => {
    expect(evaluateContributionStatus({ confirmationsCount: 10, reportsCount: 1, currentStatus: "pending" })).toBe("flagged");
  });

  it("preserves moderator decisions", () => {
    expect(evaluateContributionStatus({ confirmationsCount: 0, reportsCount: 10, currentStatus: "approved" })).toBe("approved");
    expect(evaluateContributionStatus({ confirmationsCount: 10, reportsCount: 0, currentStatus: "rejected" })).toBe("rejected");
  });
});
