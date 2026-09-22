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
  const [isFallback, setIsFallback] = useState(false);

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
          // The traveller may be just outside the first, tighter radius -
          // widen the search before giving up rather than showing "nothing
          // nearby" when a real result was 80km away instead of 75.
          const RADII_KM = [75, 250];
          let data: { places?: PlaceCardData[]; contextCity?: string | null } = {};
          for (const radiusKm of RADII_KM) {
            const params = new URLSearchParams({
              lat: String(position.coords.latitude),
              lng: String(position.coords.longitude),
              radiusKm: String(radiusKm),
              limit: "6",
            });
            const res = await fetch(`/api/places?${params.toString()}`);
            if (!res.ok) throw new Error("nearby lookup failed");
            data = await res.json();
            if ((data.places?.length ?? 0) > 0) break;
          }

          // Nothing within even the widest radius: the destination simply
          // isn't covered yet, but the traveller asked to see places, so
          // show well-regarded ones instead of a dead end.
          let fallback = false;
          if ((data.places?.length ?? 0) === 0) {
            const fallbackRes = await fetch(`/api/places?recommended=true&limit=6`);
            if (fallbackRes.ok) {
              data = await fallbackRes.json();
              fallback = true;
            }
          }

          setNearby(data.places ?? []);
          setCity(fallback ? null : (data.contextCity ?? null));
          setIsFallback(fallback);
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
      <div className="rounded-2xl bg-gradient-to-br from-sky-500/10 to-turquoise-500/10 p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white text-2xl shadow-sm dark:bg-brand-900">
          <span aria-hidden="true">📍</span>
        </div>
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
          {status === "denied" ? dict.errors.forbidden : status === "error" ? dict.common.somethingWentWrong : dict.home.emptyNearby}
        </p>
        <Button variant="primary" size="sm" onClick={handleEnableLocation}>
          {dict.home.enableLocation}
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
      {isFallback ? (
        <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">{dict.home.nearbyFallback}</p>
      ) : (
        city && <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">{city}</p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {nearby.map((place) => (
          <PlaceCard key={place.id} place={place} locale={locale} trustLabel={placeTrustLabel(place.sourceType, dict)} />
        ))}
      </div>
    </div>
  );
}
