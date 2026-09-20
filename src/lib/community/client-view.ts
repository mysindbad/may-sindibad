/** Client-safe community contribution projections. */
export type ContributionClientViewInput = {
  id: string;
  type: string;
  placeId: string | null;
  payload: unknown;
  status: string;
  confirmationsCount: number;
  source: string;
  reviewNote?: string | null;
  reviewedAt?: Date | null;
  createdAt: Date;
};

export function toPublicContributionView(contribution: ContributionClientViewInput) {
  return {
    id: contribution.id,
    type: contribution.type,
    placeId: contribution.placeId,
    payload: contribution.payload,
    status: contribution.status,
    confirmationsCount: contribution.confirmationsCount,
    source: contribution.source,
    createdAt: contribution.createdAt,
  };
}

export function toOwnerContributionView(contribution: ContributionClientViewInput) {
  return {
    ...toPublicContributionView(contribution),
    reviewNote: contribution.reviewNote ?? null,
    reviewedAt: contribution.reviewedAt ?? null,
  };
}
