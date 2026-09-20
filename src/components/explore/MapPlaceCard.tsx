"use client";

import Link from "next/link";
import { useLocale } from "@/i18n/LocaleProvider";
import { Badge, Button, Card } from "@/components/ui/primitives";
import type { PlaceCardData } from "@/components/places/PlaceCard";
import { placeTrustLabel } from "@/components/places/trust";

// Tapping a marker used to jump straight out of the map to a detail page,
// which lost the map context entirely. This card keeps the traveller on the
// map and offers the two things they actually want next: read more, or go.
export function MapPlaceCard({ place, onClose }: { place: PlaceCardData; onClose: () => void }) {
  const { dict, locale } = useLocale();

  return (
    <Card className="pointer-events-auto w-full max-w-md p-3 shadow-[var(--shadow-elevated)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-brand-950">{place.name}</h3>
          <p className="truncate text-xs text-slate-500">
            {place.city}, {place.country}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={dict.common.close}
          className="shrink-0 rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          ✕
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge tone="sky">{placeTrustLabel(place.sourceType, dict)}</Badge>
        {/* Only show a rating that real reviews back; an unrated place shows nothing. */}
        {place.ratingCount > 0 && (
          <span className="text-xs font-medium text-amber-600">
            ★ {place.ratingAverage.toFixed(1)} ({place.ratingCount})
          </span>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <Link href={"/" + locale + "/navigate/" + place.id} className="flex-1">
          <Button size="sm" fullWidth>
            🧭 {dict.navigation.takeMeThere}
          </Button>
        </Link>
        <Link href={"/" + locale + "/explore/" + place.id}>
          <Button size="sm" variant="ghost">
            {dict.navigation.details}
          </Button>
        </Link>
      </div>
    </Card>
  );
}
