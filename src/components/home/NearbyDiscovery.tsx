"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { PlaceCard, type PlaceCardData } from "@/components/places/PlaceCard";
import { placeTrustLabel } from "@/components/places/trust";

type Status = "loading" | "ready";
type NearbyResponse = { places?: PlaceCardData[]; contextCity?: string | null };

/** Asking for location is LocationPrompt's job (a one-time popup) - this
 * component only ever shows content: the traveller's own real nearby places
 * when permission already exists, generally recommended ones otherwise, and
 * it re-fetches for real the moment the popup reports a fresh grant. */
export function NearbyDiscovery() {
  const { dict, locale } = useLocale();
  const [status, setStatus] = useState<Status>("loading");
  const [city, setCity] = useState<string | null>(null);
  const [nearby, setNearby] = useState<PlaceCardData[]>([]);
  const [isFallback, setIsFallback] = useState(false);

  async function loadFallback() {
    try {
      const res = await fetch(`/api/places?recommended=true&limit=6`);
      const data: NearbyResponse = res.ok ? await res.json() : {};
      setNearby(data.places ?? []);
      setCity(null);
      setIsFallback(true);
    } finally {
      setStatus("ready");
    }
  }

  async function loadReal(position: { lat: number; lng: number }) {
    try {
      // The traveller may be just outside the first, tighter radius - widen
      // the search before giving up rather than showing "nothing nearby"
      // when a real result was 80km away instead of 75.
      const RADII_KM = [75, 250];
      let data: NearbyResponse = {};
      for (const radiusKm of RADII_KM) {
        const params = new URLSearchParams({
          lat: String(position.lat),
          lng: String(position.lng),
          radiusKm: String(radiusKm),
          limit: "6",
        });
        const res = await fetch(`/api/places?${params.toString()}`);
        if (!res.ok) throw new Error("nearby lookup failed");
        data = await res.json();
        if ((data.places?.length ?? 0) > 0) break;
      }

      if ((data.places?.length ?? 0) === 0) {
        await loadFallback();
        return;
      }
      setNearby(data.places ?? []);
      setCity(data.contextCity ?? null);
      setIsFallback(false);
      setStatus("ready");
    } catch {
      await loadFallback();
    }
  }

  useEffect(() => {
    let cancelled = false;

    function tryReal() {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (!cancelled) void loadReal({ lat: position.coords.latitude, lng: position.coords.longitude });
        },
        () => {
          if (!cancelled) void loadFallback();
        },
        { timeout: 8000, maximumAge: 60_000, enableHighAccuracy: false },
      );
    }

    if (!("geolocation" in navigator)) {
      void loadFallback();
    } else if ("permissions" in navigator) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((result) => {
          if (cancelled) return;
          if (result.state === "granted") tryReal();
          else void loadFallback();
        })
        .catch(() => {
          if (!cancelled) void loadFallback();
        });
    } else {
      void loadFallback();
    }

    function onGranted(event: Event) {
      const detail = (event as CustomEvent<{ lat: number; lng: number }>).detail;
      if (detail) void loadReal(detail);
    }
    window.addEventListener("sindbad:location-granted", onGranted);
    return () => {
      cancelled = true;
      window.removeEventListener("sindbad:location-granted", onGranted);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "loading") {
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
