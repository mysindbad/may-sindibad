import Link from "next/link";
import { Badge, Card } from "@/components/ui/primitives";

export interface PlaceCardData {
  id: string;
  name: string;
  description: string | null;
  city: string;
  country: string;
  lat?: number;
  lng?: number;
  priceLevel: number;
  ratingAverage: number;
  ratingCount: number;
  sourceType: "seed" | "community" | "provider" | "verified";
  coverImageUrl?: string | null;
}

const TRUST_TONE = {
  seed: "sky",
  provider: "turquoise",
  verified: "lime",
  community: "sun",
} as const;

export function PlaceCard({ place, locale, trustLabel }: { place: PlaceCardData; locale: string; trustLabel: string }) {
  const category = categoryFor(place);
  return (
    <Link href={`/${locale}/explore/${place.id}`} className="block">
      <Card className="h-full overflow-hidden transition-shadow hover:shadow-[var(--shadow-elevated)]">
        {place.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote cover photos come from arbitrary provider/S3 hosts, not the local image loader's fixed domain list.
          <img src={place.coverImageUrl} alt="" className="h-28 w-full object-cover" />
        ) : (
          <div className={`flex h-28 items-center justify-center bg-gradient-to-br ${category.gradient}`}>
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/20 text-2xl backdrop-blur-sm">
              {category.icon}
            </span>
          </div>
        )}
        <div className="space-y-1.5 p-3.5">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-brand-950">{place.name}</h3>
          <div className="flex items-center justify-between gap-2">
            <p className="line-clamp-1 text-xs text-slate-500">
              {place.city}, {place.country}
            </p>
            {place.ratingCount > 0 && (
              <span className="shrink-0 text-xs font-medium text-amber-600">★ {place.ratingAverage.toFixed(1)}</span>
            )}
          </div>
          <Badge tone={TRUST_TONE[place.sourceType]} className="mt-1">
            {trustLabel}
          </Badge>
        </div>
      </Card>
    </Link>
  );
}

interface PlaceCategoryStyle {
  icon: string;
  gradient: string;
}

const CATEGORY_STYLES: Record<string, PlaceCategoryStyle> = {
  beach: { icon: "🏖️", gradient: "from-sky-500 to-cyan-400" },
  cafe: { icon: "☕", gradient: "from-amber-700 to-amber-400" },
  restaurant: { icon: "🍽️", gradient: "from-rose-600 to-orange-400" },
  hotel: { icon: "🛏️", gradient: "from-violet-700 to-fuchsia-500" },
  landmark: { icon: "🕌", gradient: "from-amber-600 to-yellow-400" },
  default: { icon: "📍", gradient: "from-brand-800 to-sky-500" },
};

function categoryFor(place: { name: string }): PlaceCategoryStyle {
  const key = place.name.toLowerCase();
  if (key.includes("beach") || key.includes("plage")) return CATEGORY_STYLES.beach;
  if (key.includes("café") || key.includes("cafe") || key.includes("coffee")) return CATEGORY_STYLES.cafe;
  if (key.includes("restaurant") || key.includes("resto")) return CATEGORY_STYLES.restaurant;
  if (key.includes("riad") || key.includes("hotel")) return CATEGORY_STYLES.hotel;
  if (key.includes("mosque") || key.includes("kasbah") || key.includes("garden")) return CATEGORY_STYLES.landmark;
  return CATEGORY_STYLES.default;
}
