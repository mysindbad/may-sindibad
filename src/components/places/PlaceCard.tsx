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
  return (
    <Link href={`/${locale}/explore/${place.id}`} className="block">
      <Card className="h-full overflow-hidden transition-shadow hover:shadow-[var(--shadow-elevated)]">
        <div className="flex h-28 items-center justify-center bg-gradient-to-br from-brand-800 to-sky-500 text-3xl text-white">
          {categoryEmoji(place)}
        </div>
        <div className="space-y-1.5 p-3.5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-1 text-sm font-semibold text-brand-950">{place.name}</h3>
            {place.ratingCount > 0 && (
              <span className="shrink-0 text-xs font-medium text-amber-600">★ {place.ratingAverage.toFixed(1)}</span>
            )}
          </div>
          <p className="line-clamp-1 text-xs text-slate-500">
            {place.city}, {place.country}
          </p>
          <Badge tone={TRUST_TONE[place.sourceType]} className="mt-1">
            {trustLabel}
          </Badge>
        </div>
      </Card>
    </Link>
  );
}

function categoryEmoji(place: { name: string }): string {
  const key = place.name.toLowerCase();
  if (key.includes("beach") || key.includes("plage")) return "🏖️";
  if (key.includes("café") || key.includes("cafe") || key.includes("coffee")) return "☕";
  if (key.includes("restaurant") || key.includes("resto")) return "🍽️";
  if (key.includes("riad") || key.includes("hotel")) return "🛏️";
  if (key.includes("mosque") || key.includes("kasbah") || key.includes("garden")) return "🕌";
  return "📍";
}
