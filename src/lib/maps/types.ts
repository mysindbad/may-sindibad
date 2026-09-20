// Map-provider-agnostic types. The actual rendering component
// (src/components/map/MapView.tsx) wraps MapLibre GL (open, no vendor lock)
// and consumes one configurable raster-tile endpoint. Pages and API routes do
// not depend on a specific map vendor.
export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  title: string;
  category?: string | null;
  isSponsored?: boolean;
}

export interface MapViewport {
  lat: number;
  lng: number;
  zoom: number;
}

export interface RasterTileConfig {
  tileUrl: string;
  attribution: string;
}

const DEVELOPMENT_OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const DEVELOPMENT_OSM_ATTRIBUTION = "&copy; OpenStreetMap contributors";

/**
 * Production deliberately has no implicit public-tile fallback. A dedicated
 * provider (or self-hosted tiles) must be configured before release so My
 * Sindbad does not accidentally depend on a best-effort community endpoint.
 * Development keeps the prior OSM fallback for local QA only.
 */
export function resolveRasterTileConfig(env: NodeJS.ProcessEnv = process.env): RasterTileConfig | null {
  const tileUrl = env.NEXT_PUBLIC_MAP_TILE_URL?.trim();
  const attribution = env.NEXT_PUBLIC_MAP_ATTRIBUTION?.trim();

  const hasExplicitConfig = Boolean(tileUrl || attribution);
  if (hasExplicitConfig) {
    if (!tileUrl || !attribution || !tileUrl.includes("{z}") || !tileUrl.includes("{x}") || !tileUrl.includes("{y}")) return null;
    try {
      const parsed = new URL(tileUrl.replace("{z}", "0").replace("{x}", "0").replace("{y}", "0"));
      if (parsed.protocol === "https:" || (env.NODE_ENV !== "production" && parsed.protocol === "http:")) {
        return { tileUrl, attribution };
      }
    } catch {
      return null;
    }
    return null;
  }

  if (env.NODE_ENV !== "production") {
    return { tileUrl: DEVELOPMENT_OSM_TILE_URL, attribution: DEVELOPMENT_OSM_ATTRIBUTION };
  }

  return null;
}

export function createRasterTileStyle(config: RasterTileConfig) {
  return {
    version: 8 as const,
    sources: {
      "raster-tiles": {
        type: "raster" as const,
        tiles: [config.tileUrl],
        tileSize: 256,
        attribution: config.attribution,
      },
    },
    layers: [{ id: "base-raster", type: "raster" as const, source: "raster-tiles" }],
  };
}

export function getDefaultTileStyle() {
  const config = resolveRasterTileConfig();
  return config ? createRasterTileStyle(config) : null;
}
