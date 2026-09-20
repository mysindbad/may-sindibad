import type { Dictionary } from "@/i18n/dictionaries/en";

// Category slugs are storage keys, not copy. They were being rendered raw, so
// an Arabic screen showed "restaurant" and "attraction" in Latin script next
// to fully translated text. Anything user-facing goes through here.

const KNOWN_CATEGORIES = [
  "attraction",
  "beach",
  "restaurant",
  "cafe",
  "hotel",
  "activity",
  "tour",
  "transport",
  "vehicle",
  "boat",
  "transfer",
  "other",
] as const;

export type KnownCategory = (typeof KNOWN_CATEGORIES)[number];

export function isKnownCategory(slug: string): slug is KnownCategory {
  return (KNOWN_CATEGORIES as readonly string[]).includes(slug);
}

/**
 * Translated label for a category slug. An unknown slug falls back to itself
 * rather than to an empty string: showing "souk" is honest, showing nothing
 * looks broken.
 */
export function categoryLabel(slug: string, dict: Dictionary): string {
  return isKnownCategory(slug) ? dict.categories[slug] : slug;
}
