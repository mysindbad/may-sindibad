"use client";

import { useEffect, useRef } from "react";
import { Map as MapLibreMap, Marker as MapLibreMarker, NavigationControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { getDefaultTileStyle, type MapMarker } from "@/lib/maps/types";

// Thin wrapper around MapLibre GL. Only this file talks to the map SDK; the
// raster endpoint itself is environment-configured so production is not tied
// to a hard-coded public tile service.
export function MapView({
  markers,
  center,
  zoom = 12,
  onMarkerClick,
  className,
}: {
  markers: MapMarker[];
  center: { lat: number; lng: number };
  zoom?: number;
  onMarkerClick?: (id: string) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const style = getDefaultTileStyle();
    if (!style) {
      console.error("Map tiles are not configured for this environment.");
      return;
    }
    mapRef.current = new MapLibreMap({
      container: containerRef.current,
      style,
      center: [center.lng, center.lat],
      zoom,
      attributionControl: { compact: true },
    });
    mapRef.current.addControl(new NavigationControl({ showCompass: false }), "top-right");

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ center: [center.lng, center.lat], zoom, duration: 400 });
  }, [center.lat, center.lng, zoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = markers.map((marker) => {
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", marker.title);
      el.style.width = "30px";
      el.style.height = "30px";
      el.style.borderRadius = "9999px";
      el.style.border = "2px solid white";
      el.style.boxShadow = "0 2px 8px rgba(7,28,51,0.35)";
      el.style.background = marker.isSponsored ? "#f4b93e" : "#0b3552";
      el.style.cursor = "pointer";

      el.addEventListener("click", () => onMarkerClick?.(marker.id));

      return new MapLibreMarker({ element: el }).setLngLat([marker.lng, marker.lat]).addTo(map);
    });
  }, [markers, onMarkerClick]);

  return <div ref={containerRef} className={className ?? "h-full w-full"} />;
}
