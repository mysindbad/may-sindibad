export type CommunityContributionType = "new_place" | "place_correction" | "photo" | "info_update";

/**
 * Only contribution types with a complete moderation -> application path may
 * be accepted. This prevents the API from marking a correction/photo/info
 * update "approved" when no code actually applies that change yet.
 */
export function isImplementedContributionType(type: CommunityContributionType): boolean {
  return type === "new_place";
}
