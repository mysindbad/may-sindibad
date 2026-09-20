import type { Dictionary } from "@/i18n/dictionaries/en";

export function placeTrustLabel(sourceType: "seed" | "community" | "provider" | "verified", dict: Dictionary): string {
  if (sourceType === "verified" || sourceType === "provider") return dict.explore.verified;
  if (sourceType === "community") return dict.explore.communityVerified;
  return dict.explore.verified; // seed data ships pre-approved by the product team
}
