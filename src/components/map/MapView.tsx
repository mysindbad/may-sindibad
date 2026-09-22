"use client";

import { useEffect, useRef } from "react";
import { Map as MapLibreMap, Marker as MapLibreMarker, NavigationControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { getDefaultTileStyle, type MapMarker } from "@/lib/maps/types";
import { placeCategoryStyle } from "@/lib/domain/place-category";

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
      // A plain coloured dot forced a tap before a traveller even knew what a
      // pin was for. A small labelled card - the same category icon and
      // colour used on place cards, plus the name itself - reads at a glance.
      const style = placeCategoryStyle(marker.category, marker.title);
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", marker.title);
      el.style.display = "inline-flex";
      el.style.alignItems = "center";
      el.style.gap = "5px";
      el.style.maxWidth = "150px";
      el.style.padding = "5px 10px 5px 5px";
      el.style.borderRadius = "9999px";
      el.style.border = "2px solid white";
      el.style.boxShadow = "0 2px 8px rgba(7,28,51,0.35)";
      el.style.background = marker.isSponsored ? "#f4b93e" : style.solidColor;
      el.style.color = "#ffffff";
      el.style.cursor = "pointer";
      el.style.fontFamily = "inherit";

      const iconEl = document.createElement("span");
      iconEl.style.display = "flex";
      iconEl.style.flexShrink = "0";
      iconEl.style.alignItems = "center";
      iconEl.style.justifyContent = "center";
      iconEl.style.width = "20px";
      iconEl.style.height = "20px";
      iconEl.style.borderRadius = "9999px";
      iconEl.style.background = "rgba(255,255,255,0.25)";
      iconEl.style.fontSize = "12px";
      iconEl.style.lineHeight = "1";
      iconEl.textContent = style.icon;

      const labelEl = document.createElement("span");
      labelEl.style.overflow = "hidden";
      labelEl.style.textOverflow = "ellipsis";
      labelEl.style.whiteSpace = "nowrap";
      labelEl.style.fontSize = "11px";
      labelEl.style.fontWeight = "600";
      labelEl.style.lineHeight = "1.2";
      labelEl.textContent = marker.title;

      el.appendChild(iconEl);
      el.appendChild(labelEl);
      el.addEventListener("click", () => onMarkerClick?.(marker.id));

      return new MapLibreMarker({ element: el, anchor: "bottom" }).setLngLat([marker.lng, marker.lat]).addTo(map);
    });
  }, [markers, onMarkerClick]);

  return <div ref={containerRef} className={className ?? "h-full w-full"} />;
}
