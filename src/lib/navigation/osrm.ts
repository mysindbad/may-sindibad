import {
  WALKING_PACE_METRES_PER_SECOND,
  metresBetween,
  type DirectionsFailureCode,
  type LatLng,
  type RoutePlan,
  type RoutePoint,
  type TravelMode,
} from "@/lib/navigation/route";

// Validation of an OSRM /route response. A routing engine is third-party input
// and the failure we care about is not a crash but a plausible-looking wrong
// answer (a car route for a pedestrian, a line that ends streets away from the
// destination), so every accepted route has to pass physical sanity checks.

export interface OsrmResponse {
  code?: string;
  routes?: Array<{
    distance?: number;
    duration?: number;
    geometry?: { coordinates?: unknown };
  }>;
}

/** Engines snap to the nearest road; a line ending farther than this from the point is not "to" it. */
export const MAX_ENDPOINT_OFFSET_METRES = 1500;

/** A walker averaging more than this (9 km/h) means the engine routed a vehicle. */
export const MAX_PLAUSIBLE_WALKING_SPEED = 2.5;
const MIN_PLAUSIBLE_WALKING_SPEED = 0.4;

export function readGeometry(raw: unknown): RoutePoint[] {
  if (!Array.isArray(raw)) return [];
  const points: RoutePoint[] = [];
  for (const entry of raw) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const lng = Number(entry[0]);
    const lat = Number(entry[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
    points.push([lng, lat]);
  }
  return points;
}

export type ParsedRoute = { ok: true; plan: RoutePlan } | { ok: false; code: DirectionsFailureCode };

export function parseOsrmRoute(
  payload: OsrmResponse,
  from: LatLng,
  to: LatLng,
  mode: TravelMode,
  provider: RoutePlan["provider"],
): ParsedRoute {
  if (payload.code !== "Ok") {
    // NoRoute / NoSegment mean the engine is up but there is no path near one
    // of the points (e.g. an island, or a pin in a car-free area for driving).
    if (payload.code === "NoRoute" || payload.code === "NoSegment") return { ok: false, code: "no_route_nearby" };
    return { ok: false, code: "route_unavailable" };
  }

  const route = payload.routes?.[0];
  if (!route) return { ok: false, code: "route_unavailable" };

  const geometry = readGeometry(route.geometry?.coordinates);
  if (geometry.length < 2) return { ok: false, code: "route_unavailable" };

  const distance = Number(route.distance);
  if (!Number.isFinite(distance) || distance <= 0) return { ok: false, code: "route_unavailable" };

  const first = geometry[0];
  const last = geometry[geometry.length - 1];
  const originOffset = metresBetween(from, { lat: first[1], lng: first[0] });
  const destinationOffset = metresBetween(to, { lat: last[1], lng: last[0] });
  if (originOffset > MAX_ENDPOINT_OFFSET_METRES || destinationOffset > MAX_ENDPOINT_OFFSET_METRES) {
    return { ok: false, code: "no_route_nearby" };
  }

  const rawDuration = Number(route.duration);
  const hasDuration = Number.isFinite(rawDuration) && rawDuration > 0;
  let durationSeconds = hasDuration ? rawDuration : 0;
  let durationBasis: RoutePlan["durationBasis"] = "provider";

  if (mode === "walking") {
    if (hasDuration) {
      const speed = distance / rawDuration;
      // Car speed on a "walking" answer: the engine ignored the foot profile.
      if (speed > MAX_PLAUSIBLE_WALKING_SPEED) return { ok: false, code: "profile_mismatch" };
      if (speed < MIN_PLAUSIBLE_WALKING_SPEED) {
        durationSeconds = distance / WALKING_PACE_METRES_PER_SECOND;
        durationBasis = "pace";
      }
    } else {
      durationSeconds = distance / WALKING_PACE_METRES_PER_SECOND;
      durationBasis = "pace";
    }
  } else if (!hasDuration) {
    // No credible driving time and no honest way to invent one.
    return { ok: false, code: "route_unavailable" };
  }

  return {
    ok: true,
    plan: {
      mode,
      distanceMeters: Math.round(distance),
      durationSeconds: Math.round(durationSeconds),
      durationBasis,
      geometry,
      originOffsetMeters: Math.round(originOffset),
      destinationOffsetMeters: Math.round(destinationOffset),
      provider,
    },
  };
}
