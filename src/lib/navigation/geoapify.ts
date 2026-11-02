import {
  metresBetween,
  type DirectionsFailureCode,
  type LatLng,
  type RoutePoint,
  type TravelMode,
} from "@/lib/navigation/route";
import { MAX_ENDPOINT_OFFSET_METRES, parseOsrmRoute, readGeometry, type ParsedRoute } from "@/lib/navigation/osrm";

// Geoapify Routing API (https://apidocs.geoapify.com/docs/routing/).
//
// Pure request building and response validation - no network, no secrets of
// its own - so every rule that protects the traveller (real road geometry
// only, correct coordinate order, honest failures) and the free-plan budget
// (no paid extras requested) can be unit-tested against recorded shapes.
//
// What the docs say, and what they do not:
//   * GET /v1/routing?waypoints=lat,lon|lat,lon&mode=walk|drive&apiKey=...
//   * 1 credit per waypoint pair, +1 per full 500 km, +1 for each of
//     route_details / elevation / avoid options. We request none of those.
//   * The GeoJSON feature has properties.distance (m), properties.time (s),
//     properties.distance_units. The docs call the geometry a MultiLineString
//     (one LineString per leg) but do NOT state coordinate order, and do not
//     document 401/403/429 bodies. So order is verified against the requested
//     points rather than assumed, and unknown statuses are handled generically.

export const GEOAPIFY_DEFAULT_BASE_URL = "https://api.geoapify.com";

const GEOAPIFY_MODE: Record<TravelMode, string> = { walking: "walk", driving: "drive" };

/** Credits a normal short route costs: one waypoint pair, nothing optional. */
export const CREDITS_PER_ROUTE = 1;

/** A route this long costs one more credit per full 500 km (docs). */
export const CREDIT_DISTANCE_STEP_METRES = 500_000;

export function extraCreditsForDistance(distanceMeters: number): number {
  return Math.max(0, Math.floor(distanceMeters / CREDIT_DISTANCE_STEP_METRES));
}

export function buildGeoapifyUrl(baseUrl: string, apiKey: string, from: LatLng, to: LatLng, mode: TravelMode): string {
  // Deliberately NO details / avoid / traffic parameters: each costs credits.
  const params = new URLSearchParams({
    waypoints: `${from.lat},${from.lng}|${to.lat},${to.lng}`,
    mode: GEOAPIFY_MODE[mode],
    type: "balanced",
    units: "metric",
    format: "geojson",
    apiKey,
  });
  return baseUrl.replace(/\/+$/, "") + "/v1/routing?" + params.toString();
}

/** Remove every occurrence of the key (raw and URL-encoded) from text bound for a log or a response. */
export function redactKey(text: string, apiKey: string): string {
  if (!apiKey) return text;
  return text.split(apiKey).join("[redacted]").split(encodeURIComponent(apiKey)).join("[redacted]");
}

export type GeoapifyStatusClass = "ok" | "auth" | "limit" | "bad_request" | "unavailable";

/** The docs do not list 401/403/429 bodies, so classify by status code alone. */
export function classifyGeoapifyStatus(status: number): GeoapifyStatusClass {
  if (status >= 200 && status < 300) return "ok";
  if (status === 401 || status === 403) return "auth"; // missing/invalid/blocked key or referrer rules
  if (status === 402 || status === 429) return "limit"; // plan limit / rate limit reached
  if (status >= 400 && status < 500) return "bad_request";
  return "unavailable";
}

interface GeoapifyFeature {
  geometry?: { type?: string; coordinates?: unknown };
  properties?: { distance?: unknown; time?: unknown; distance_units?: unknown };
}

export interface GeoapifyResponse {
  type?: string;
  features?: GeoapifyFeature[];
}

/** LineString -> points, MultiLineString -> legs joined without repeating the shared vertex. */
function flattenGeometry(geometry: GeoapifyFeature["geometry"]): unknown[] {
  if (!geometry || !Array.isArray(geometry.coordinates)) return [];
  const coordinates = geometry.coordinates as unknown[];
  if (geometry.type === "LineString") return coordinates;
  if (geometry.type === "MultiLineString") {
    const joined: unknown[] = [];
    for (const leg of coordinates) {
      if (!Array.isArray(leg)) continue;
      for (const point of leg) {
        const previous = joined[joined.length - 1];
        const same =
          Array.isArray(previous) && Array.isArray(point) && previous[0] === point[0] && previous[1] === point[1];
        if (!same) joined.push(point);
      }
    }
    return joined;
  }
  return [];
}

/**
 * GeoJSON is [lon, lat], but this API's docs never say so. Accept the points as
 * given when the route starts/ends near the requested points that way round;
 * if only the swapped reading fits, swap them; if neither fits, the route is
 * not "from here to there" and is rejected.
 */
export function orientGeometry(points: RoutePoint[], from: LatLng, to: LatLng): RoutePoint[] | null {
  if (points.length < 2) return null;
  const fits = (candidate: RoutePoint[]) => {
    const first = candidate[0];
    const last = candidate[candidate.length - 1];
    return (
      metresBetween(from, { lat: first[1], lng: first[0] }) <= MAX_ENDPOINT_OFFSET_METRES &&
      metresBetween(to, { lat: last[1], lng: last[0] }) <= MAX_ENDPOINT_OFFSET_METRES
    );
  };
  if (fits(points)) return points;
  const swapped = points.map(([a, b]) => [b, a] as RoutePoint);
  // A swapped reading is only valid if every point is then a legal lat/lng.
  if (swapped.every(([lng, lat]) => Math.abs(lat) <= 90 && Math.abs(lng) <= 180) && fits(swapped)) return swapped;
  return null;
}

export function parseGeoapifyRoute(payload: GeoapifyResponse, from: LatLng, to: LatLng, mode: TravelMode): ParsedRoute {
  const feature = payload?.features?.[0];
  if (!feature) return { ok: false, code: "route_unavailable" };

  const units = feature.properties?.distance_units;
  // We asked for metric. Anything else would silently turn miles into metres.
  if (units !== undefined && !/^met(er|re)s?$/i.test(String(units))) return { ok: false, code: "route_unavailable" };

  const raw = readGeometry(flattenGeometry(feature.geometry));
  const oriented = orientGeometry(raw, from, to);
  if (!oriented) return { ok: false, code: raw.length < 2 ? "route_unavailable" : "no_route_nearby" };

  const distance = Number(feature.properties?.distance);
  const time = Number(feature.properties?.time);

  // From here the checks are identical to any other engine's answer: endpoint
  // offsets, a walking time that is not car speed, no invented driving time.
  return parseOsrmRoute(
    { code: "Ok", routes: [{ distance, duration: time, geometry: { coordinates: oriented } }] },
    from,
    to,
    mode,
    "geoapify",
  );
}

export type GeoapifyFailureMapping = { code: DirectionsFailureCode; retryable: boolean };

export function failureForStatus(statusClass: GeoapifyStatusClass): GeoapifyFailureMapping {
  switch (statusClass) {
    case "auth":
      return { code: "provider_not_configured", retryable: false };
    case "limit":
      return { code: "routing_paused", retryable: false };
    case "bad_request":
      return { code: "no_route_nearby", retryable: false };
    default:
      return { code: "route_unavailable", retryable: true };
  }
}
