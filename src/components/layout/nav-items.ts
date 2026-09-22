export interface NavItem {
  key: "home" | "explore" | "community" | "trips" | "profile";
  href: string;
  icon: string;
}

// Five destinations only — everything else (Today, Bookings, Marketplace,
// Settings) is reached contextually from these, keeping the primary
// navigation simple and predictable on mobile. Sindbad AI isn't a tab here:
// it's the home page's main call to action instead, which is where a
// traveller already lands by default.
export const NAV_ITEMS: NavItem[] = [
  { key: "home", href: "", icon: "🏠" },
  { key: "explore", href: "/explore", icon: "🧭" },
  { key: "trips", href: "/trips", icon: "🗺️" },
  { key: "community", href: "/community", icon: "👥" },
  { key: "profile", href: "/profile", icon: "👤" },
];
