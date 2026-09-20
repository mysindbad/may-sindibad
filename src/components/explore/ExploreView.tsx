"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useLocale } from "@/i18n/LocaleProvider";
import { Input, Button, Badge } from "@/components/ui/primitives";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { PlaceCard, type PlaceCardData } from "@/components/places/PlaceCard";
import { placeTrustLabel } from "@/components/places/trust";
import { MapPlaceCard } from "@/components/explore/MapPlaceCard";
import { categoryLabel } from "@/lib/domain/category-labels";
import { cn } from "@/lib/utils";

const MapView = dynamic(() => import("@/components/map/MapView").then((m) => m.MapView), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

const CATEGORY_FILTERS = ["attraction", "beach", "restaurant", "cafe", "hotel", "activity", "tour"];

export function ExploreView({ initialCity }: { initialCity: string }) {
  const { dict, locale } = useLocale();

  const [search, setSearch] = useState(initialCity);
  const [searchInput, setSearchInput] = useState(initialCity);
  const [category, setCategory] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "map">("list");
  const [places, setPlaces] = useState<PlaceCardData[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async (targetSearch: string, targetCategory: string | null) => {
    if (!targetSearch) return;
    setStatus("loading");
    try {
      const params = new URLSearchParams({ q: targetSearch, limit: "30" });
      if (targetCategory) params.set("category", targetCategory);
      const res = await fetch(`/api/places?${params.toString()}`);
      if (!res.ok) throw new Error("failed");
      const data = (await res.json()) as { places: PlaceCardData[] };
      setPlaces(data.places ?? []);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    load(search, category);
  }, [search, category, load]);

  const mapCenter = useMemo(() => {
    const located = places.find((place) => typeof place.lat === "number" && typeof place.lng === "number");
    return located ? { lat: located.lat!, lng: located.lng! } : { lat: 20, lng: 0 };
  }, [places]);

  const selectedPlace = useMemo(() => places.find((place) => place.id === selectedId) ?? null, [places, selectedId]);

  return (
    <div className="mx-auto flex h-[calc(100dvh-56px)] max-w-6xl flex-col px-4 py-4 md:h-[calc(100dvh-64px)]">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <form
          className="flex flex-1 min-w-[200px] gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput.trim());
          }}
        >
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={dict.explore.searchPlaceholder}
            aria-label={dict.explore.searchPlaceholder}
          />
          <Button type="submit" variant="secondary" aria-label={dict.explore.searchPlaceholder}>
            <span aria-hidden="true">🔎</span>
          </Button>
        </form>
        <div className="flex overflow-hidden rounded-xl border border-slate-200">
          <button
            type="button"
            onClick={() => setView("list")}
            aria-pressed={view === "list"}
            className={cn("px-3 py-2 text-sm font-medium", view === "list" ? "bg-brand-800 text-white" : "bg-white text-slate-600")}
          >
            {dict.explore.listView}
          </button>
          <button
            type="button"
            onClick={() => setView("map")}
            aria-pressed={view === "map"}
            className={cn("px-3 py-2 text-sm font-medium", view === "map" ? "bg-brand-800 text-white" : "bg-white text-slate-600")}
          >
            {dict.explore.mapView}
          </button>
        </div>
      </div>

      <div className="mb-3 flex gap-2 overflow-x-auto scrollbar-none">
        {CATEGORY_FILTERS.map((slug) => (
          <button key={slug} type="button" onClick={() => setCategory(category === slug ? null : slug)} aria-pressed={category === slug}>
            <Badge tone={category === slug ? "brand" : "neutral"}>{categoryLabel(slug, dict)}</Badge>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden rounded-2xl">
        {status === "loading" && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        )}

        {status === "error" && <EmptyState title={dict.common.somethingWentWrong} action={<Button onClick={() => load(search, category)}>{dict.common.retry}</Button>} />}

        {status === "ready" && places.length === 0 && <EmptyState icon="🧭" title={dict.explore.noResults} body={dict.explore.noResultsHint} />}

        {status === "ready" && places.length > 0 && view === "list" && (
          <div className="grid grid-cols-2 gap-3 overflow-y-auto pb-6 sm:grid-cols-3">
            {places.map((place) => (
              <PlaceCard key={place.id} place={place} locale={locale} trustLabel={placeTrustLabel(place.sourceType, dict)} />
            ))}
          </div>
        )}

        {status === "ready" && view === "map" && (
          <div className="relative h-full">
            <MapView
              className="h-full min-h-[400px] w-full rounded-2xl"
              center={mapCenter}
              markers={places.filter((p) => typeof p.lat === "number" && typeof p.lng === "number").map((p) => ({ id: p.id, lat: p.lat!, lng: p.lng!, title: p.name }))}
              onMarkerClick={(id) => setSelectedId(id)}
            />
            {selectedPlace && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3">
                <MapPlaceCard place={selectedPlace} onClose={() => setSelectedId(null)} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
