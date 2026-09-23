"use client";

import { useEffect, useRef } from "react";
import { Map as MapLibreMap, Marker as MapLibreMarker, NavigationControl, LngLatBounds } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { getDefaultTileStyle } from "@/lib/maps/types";
import { metresBetween, type RoutePoint } from "@/lib/navigation/route";

/** Below this distance to the destination, a tight follow-zoom still keeps it
 * in view - a walker arriving no longer needs the wider picture. Above it,
 * snapping to zoom 16 on the traveller alone could push the destination and
 * the route line right off the edge of the map. */
const CLOSE_FOLLOW_METRES = 250;

// Navigation map: the drawn route, the destination, and the traveller's live
// position. Kept separate from MapView because that component is a simple
// marker browser and should not grow a routing lifecycle.

const ROUTE_SOURCE = "sindbad-route";
const ROUTE_LAYER = "sindbad-route-line";
const ROUTE_CASING_LAYER = "sindbad-route-casing";

function buildDot(color: string, size: number, pulse: boolean): HTMLDivElement {
  const el = document.createElement("div");
  el.style.width = size + "px";
  el.style.height = size + "px";
  el.style.borderRadius = "9999px";
  el.style.background = color;
  el.style.border = "3px solid white";
  el.style.boxShadow = "0 2px 10px rgba(7,28,51,0.45)";
  if (pulse) el.style.animation = "sindbad-pulse 2s ease-out infinite";
  return el;
}

export function RouteMapView({
  destination,
  position,
  geometry,
  follow,
  className,
}: {
  destination: { lat: number; lng: number };
  position: { lat: number; lng: number } | null;
  geometry: RoutePoint[];
  follow: boolean;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const readyRef = useRef(false);
  const userMarkerRef = useRef<MapLibreMarker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const style = getDefaultTileStyle();
    if (!style) {
      console.error("Map tiles are not configured for this environment.");
      return;
    }

    const map = new MapLibreMap({
      container: containerRef.current,
      style,
      center: [destination.lng, destination.lat],
      zoom: 14,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    // A broken tile provider (wrong URL, revoked key) fails silently
    // per-tile otherwise - surfacing it here is what would have made a past
    // "the map looks wrong" report diagnosable from the browser console
    // alone, instead of needing a phone screenshot to spot a placeholder tile.
    map.on("error", (event) => console.error("MapLibre error", event.error));

    new MapLibreMarker({ element: buildDot("#e4572e", 20, false) })
      .setLngLat([destination.lng, destination.lat])
      .addTo(map);

    map.on("load", () => {
      readyRef.current = true;
      map.addSource(ROUTE_SOURCE, {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } },
      });
      // Two stacked lines: a wide dark casing under a bright core keeps the
      // path readable over both pale streets and dark satellite tiles.
      map.addLayer({
        id: ROUTE_CASING_LAYER,
        type: "line",
        source: ROUTE_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#0b3552", "line-width": 9, "line-opacity": 0.55 },
      });
      map.addLayer({
        id: ROUTE_LAYER,
        type: "line",
        source: ROUTE_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#22b8cf", "line-width": 5 },
      });
    });

    return () => {
      readyRef.current = false;
      userMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push the latest geometry into the map, once the style has finished loading.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function apply() {
      const current = mapRef.current;
      if (!current || !readyRef.current) return;
      const source = current.getSource(ROUTE_SOURCE);
      if (!source || typeof (source as { setData?: unknown }).setData !== "function") return;
      (source as unknown as { setData: (data: unknown) => void }).setData({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: geometry },
      });
    }

    if (readyRef.current) {
      apply();
    } else {
      map.once("load", apply);
    }
  }, [geometry]);

  // Live position marker, and camera follow once the traveller is moving.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !position) return;

    if (!userMarkerRef.current) {
      userMarkerRef.current = new MapLibreMarker({ element: buildDot("#1c7ed6", 18, true) })
        .setLngLat([position.lng, position.lat])
        .addTo(map);
    } else {
      userMarkerRef.current.setLngLat([position.lng, position.lat]);
    }

    if (!follow) return;

    // Close to arrival, a tight zoom on the traveller still keeps the
    // destination in frame - further out, the same tight zoom would push
    // both the destination and the route line off the edge of the map, so
    // fit the camera to both points instead until they are close enough.
    if (metresBetween(position, destination) <= CLOSE_FOLLOW_METRES) {
      map.easeTo({ center: [position.lng, position.lat], zoom: Math.max(map.getZoom(), 16), duration: 700 });
    } else {
      const bounds = new LngLatBounds([position.lng, position.lat], [position.lng, position.lat]);
      bounds.extend([destination.lng, destination.lat]);
      map.fitBounds(bounds, { padding: 64, maxZoom: 16, duration: 700 });
    }
  }, [position, follow, destination]);

  return <div ref={containerRef} className={className ?? "h-full w-full"} />;
}
