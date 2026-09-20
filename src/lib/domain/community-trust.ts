// Community knowledge remains untrusted until it passes a moderation step.
// Community confirmations are useful evidence, but they are not identity- or
// Sybil-resistant enough to promote content directly into global truth.
export const CONFIRMATIONS_REQUIRED_FOR_REVIEW = 3;

export type ContentStatus = "pending" | "approved" | "rejected" | "flagged";

export interface TrustInput {
  confirmationsCount: number;
  reportsCount: number;
  currentStatus: ContentStatus;
}

/**
 * Confirmations can move a contribution closer to review, but never auto-
 * approve it. Any report flags it. Approved/rejected states are preserved and
 * are expected to be set by a future privileged moderation flow.
 */
export function evaluateContributionStatus(input: TrustInput): ContentStatus {
  if (input.currentStatus === "approved" || input.currentStatus === "rejected") return input.currentStatus;
  if (input.reportsCount > 0) return "flagged";
  return "pending";
}

export function contributionReadyForReview(confirmationsCount: number, reportsCount: number): boolean {
  return reportsCount === 0 && confirmationsCount >= CONFIRMATIONS_REQUIRED_FOR_REVIEW;
}

export function trustLabel(status: ContentStatus): "unverified" | "community-verified" | "flagged" | "rejected" {
  if (status === "approved") return "community-verified";
  if (status === "flagged") return "flagged";
  if (status === "rejected") return "rejected";
  return "unverified";
}
