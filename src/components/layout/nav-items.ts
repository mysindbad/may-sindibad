export interface NavItem {
  key: "home" | "explore" | "ai" | "trips" | "profile";
  href: string;
  icon: string;
}

// Five destinations only — everything else (Today, Bookings, Marketplace,
// Community, Settings) is reached contextually from these, keeping the
// primary navigation simple and predictable on mobile.
export const NAV_ITEMS: NavItem[] = [
  { key: "home", href: "", icon: "🏠" },
  { key: "explore", href: "/explore", icon: "🧭" },
  { key: "ai", href: "/ai", icon: "✨" },
  { key: "trips", href: "/trips", icon: "🗺️" },
  { key: "profile", href: "/profile", icon: "👤" },
];
