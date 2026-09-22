"use client";

import { useState } from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import { Button } from "@/components/ui/primitives";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { PlaceCard, type PlaceCardData } from "@/components/places/PlaceCard";
import { placeTrustLabel } from "@/components/places/trust";

type Status = "idle" | "locating" | "loading" | "ready" | "denied" | "error";

export function NearbyDiscovery() {
  const { dict, locale } = useLocale();
  const [status, setStatus] = useState<Status>("idle");
  const [city, setCity] = useState<string | null>(null);
  const [nearby, setNearby] = useState<PlaceCardData[]>([]);

  async function handleEnableLocation() {
    setStatus("locating");
    if (!("geolocation" in navigator)) {
      setStatus("error");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        setStatus("loading");
        try {
          const params = new URLSearchParams({
            lat: String(position.coords.latitude),
            lng: String(position.coords.longitude),
            radiusKm: "75",
            limit: "6",
          });
          const res = await fetch(`/api/places?${params.toString()}`);
          if (!res.ok) throw new Error("nearby lookup failed");
          const data = (await res.json()) as { places?: PlaceCardData[]; contextCity?: string | null };
          setNearby(data.places ?? []);
          setCity(data.contextCity ?? null);
          setStatus("ready");
        } catch {
          setStatus("error");
        }
      },
      (error) => setStatus(error.code === error.PERMISSION_DENIED ? "denied" : "error"),
      { timeout: 8000, maximumAge: 60_000, enableHighAccuracy: false },
    );
  }

  if (status === "idle" || status === "denied" || status === "error") {
    return (
      <div className="rounded-2xl border border-dashed border-brand-900/15 bg-white/60 p-5 text-center">
        <p className="mb-3 text-sm text-slate-600">
          {status === "denied" ? dict.errors.forbidden : status === "error" ? dict.common.somethingWentWrong : dict.home.emptyNearby}
        </p>
        <Button variant="secondary" size="sm" onClick={handleEnableLocation}>
          <span aria-hidden="true">📍</span> {dict.home.enableLocation}
        </Button>
      </div>
    );
  }

  if (status === "locating" || status === "loading") {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    );
  }

  if (nearby.length === 0) return <EmptyState icon="🧭" title={dict.explore.noResults} body={dict.explore.noResultsHint} />;

  return (
    <div>
      {city && <p className="mb-2 text-xs text-slate-500">{city}</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {nearby.map((place) => (
          <PlaceCard key={place.id} place={place} locale={locale} trustLabel={placeTrustLabel(place.sourceType, dict)} />
        ))}
      </div>
    </div>
  );
}
