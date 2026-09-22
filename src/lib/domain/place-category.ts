// One category → icon/colour mapping shared by the place card grid and the
// map markers, so a restaurant looks like the same restaurant everywhere
// instead of a generic pin in one view and a coloured badge in another.

export interface PlaceCategoryStyle {
  icon: string;
  /** Tailwind gradient classes for card badges (`bg-gradient-to-br ${gradient}`). */
  gradient: string;
  /** Solid hex colour for contexts that can't use Tailwind, e.g. MapLibre DOM markers. */
  solidColor: string;
}

const CATEGORY_STYLES: Record<string, PlaceCategoryStyle> = {
  beach: { icon: "🏖️", gradient: "from-sky-500 to-cyan-400", solidColor: "#0ea5e9" },
  cafe: { icon: "☕", gradient: "from-amber-700 to-amber-400", solidColor: "#b45309" },
  restaurant: { icon: "🍽️", gradient: "from-rose-600 to-orange-400", solidColor: "#e11d48" },
  hotel: { icon: "🛏️", gradient: "from-violet-700 to-fuchsia-500", solidColor: "#7c3aed" },
  attraction: { icon: "🕌", gradient: "from-amber-600 to-yellow-400", solidColor: "#d97706" },
  activity: { icon: "🎯", gradient: "from-turquoise-500 to-turquoise-400", solidColor: "#1fb8a3" },
  tour: { icon: "🧭", gradient: "from-lime-500 to-lime-300", solidColor: "#65a30d" },
  transport: { icon: "🚗", gradient: "from-slate-600 to-slate-400", solidColor: "#475569" },
  default: { icon: "📍", gradient: "from-brand-800 to-sky-500", solidColor: "#0b3552" },
};

/**
 * Prefer the place's real category slug when available. Older or seed rows
 * without one still get a sensible icon from a keyword match on the name -
 * never a blank default just because the category link is missing.
 */
export function placeCategoryStyle(categorySlug: string | null | undefined, name: string): PlaceCategoryStyle {
  if (categorySlug && CATEGORY_STYLES[categorySlug]) return CATEGORY_STYLES[categorySlug];

  const key = name.toLowerCase();
  if (key.includes("beach") || key.includes("plage")) return CATEGORY_STYLES.beach;
  if (key.includes("café") || key.includes("cafe") || key.includes("coffee")) return CATEGORY_STYLES.cafe;
  if (key.includes("restaurant") || key.includes("resto")) return CATEGORY_STYLES.restaurant;
  if (key.includes("riad") || key.includes("hotel")) return CATEGORY_STYLES.hotel;
  if (key.includes("mosque") || key.includes("kasbah") || key.includes("garden")) return CATEGORY_STYLES.attraction;
  return CATEGORY_STYLES.default;
}
