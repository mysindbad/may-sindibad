"use client";

import { useEffect, useRef, useState } from "react";
import { Map as MapLibreMap, Marker as MapLibreMarker, NavigationControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { getDefaultTileStyle } from "@/lib/maps/types";
import { configureMapWorker } from "@/lib/maps/worker";
import { placeText } from "./strings";

// Map preview with a draggable pin, used by the place editor so an admin sees
// - and can correct - exactly where a place will be saved. When no tile
// provider is configured (production has no implicit public-tile fallback) the
// map cannot render; the editor then shows the coordinates with an
// OpenStreetMap link to verify them instead of an empty grey box.

export function PlacePinMap({
  lat,
  lng,
  onChange,
}: {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<MapLibreMarker | null>(null);
  const onChangeRef = useRef(onChange);
  const [tilesMissing, setTilesMissing] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const hasPoint = lat !== null && lng !== null;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const style = getDefaultTileStyle();
    if (!style) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time capability check on mount.
      setTilesMissing(true);
      return;
    }

    configureMapWorker();
    const map = new MapLibreMap({
      container: containerRef.current,
      style,
      center: hasPoint ? [lng as number, lat as number] : [10, 25],
      zoom: hasPoint ? 16 : 2,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.on("error", (event) => console.error("MapLibre error", event.error));

    // Clicking the map places (or moves) the pin.
    map.on("click", (event) => onChangeRef.current(event.lngLat.lat, event.lngLat.lng));

    return () => {
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the pin and camera in sync with the coordinates in the form.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !hasPoint) return;
    const lngLat: [number, number] = [lng as number, lat as number];
    if (!markerRef.current) {
      const marker = new MapLibreMarker({ draggable: true, color: "#e4572e" }).setLngLat(lngLat).addTo(map);
      marker.on("dragend", () => {
        const next = marker.getLngLat();
        onChangeRef.current(next.lat, next.lng);
      });
      markerRef.current = marker;
      map.jumpTo({ center: lngLat, zoom: Math.max(map.getZoom(), 16) });
      return;
    }
    markerRef.current.setLngLat(lngLat);
    const bounds = map.getBounds();
    if (!bounds.contains(lngLat)) map.easeTo({ center: lngLat, duration: 400 });
  }, [lat, lng, hasPoint]);

  if (tilesMissing) {
    return (
      <div role="status" className="rounded-xl border border-white/10 bg-slate-950 p-3 text-xs text-slate-400">
        <p>{placeText.mapUnavailable}</p>
        {hasPoint ? (
          <a
            href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-sky-300 underline"
          >
            {placeText.openOsm}
          </a>
        ) : (
          <p className="mt-1">{placeText.noCoordinatesYet}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div ref={containerRef} className="h-64 w-full overflow-hidden rounded-xl border border-white/10 md:h-80" />
      <p className="text-[11px] text-slate-500">{hasPoint ? placeText.pinHint : placeText.noCoordinatesYet}</p>
    </div>
  );
}
