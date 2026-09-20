import { haversineKm } from "@/lib/geo/distance";

// Pure routing maths for the in-app navigation screen. Kept free of network
// and React so the guardian rules (off-route, arrival, progress) stay testable
// and behave identically on the server estimate path and in the browser.

export type TravelMode = "walking" | "driving";

export interface LatLng {
  lat: number;
  lng: number;
}

/** GeoJSON order: [longitude, latitude]. */
export type RoutePoint = [number, number];

export interface RoutePlan {
  mode: TravelMode;
  /** "routed" came from a routing engine; "estimate" is a straight-line fallback. */
  source: "routed" | "estimate";
  distanceMeters: number;
  durationSeconds: number;
  geometry: RoutePoint[];
}

/**
 * Average speeds used when no routing engine answers. Deliberately
 * conservative: a traveller who arrives early is never harmed, one who
 * trusts an optimistic ETA and misses a booking is.
 */
const FALLBACK_SPEED_METRES_PER_SECOND: Record<TravelMode, number> = {
  walking: 1.25,
  driving: 8.5,
};

/** Treat the traveller as arrived inside this radius; GPS is rarely better. */
export const ARRIVAL_RADIUS_METRES = 45;

/** Beyond this distance from the line we consider the traveller off-route. */
export const OFF_ROUTE_RADIUS_METRES = 70;

/** A fix less precise than this cannot support turn-level guidance. */
export const POOR_ACCURACY_METRES = 60;

export function isTravelMode(value: string): value is TravelMode {
  return value === "walking" || value === "driving";
}

export function metresBetween(a: LatLng, b: LatLng): number {
  return haversineKm(a, b) * 1000;
}

/**
 * Straight-line plan used when no routing engine is configured or reachable.
 * Real streets are never straight, so the distance is padded by a detour
 * factor rather than reported as if it were a road distance.
 */
export function estimateRoute(from: LatLng, to: LatLng, mode: TravelMode): RoutePlan {
  const straight = metresBetween(from, to);
  const DETOUR_FACTOR = 1.3;
  const distanceMeters = Math.round(straight * DETOUR_FACTOR);
  return {
    mode,
    source: "estimate",
    distanceMeters,
    durationSeconds: Math.round(distanceMeters / FALLBACK_SPEED_METRES_PER_SECOND[mode]),
    geometry: [
      [from.lng, from.lat],
      [to.lng, to.lat],
    ],
  };
}

/** Initial bearing from a to b, in degrees clockwise from north. */
export function bearingDegrees(from: LatLng, to: LatLng): number {
  const toRad = Math.PI / 180;
  const lat1 = from.lat * toRad;
  const lat2 = to.lat * toRad;
  const dLng = (to.lng - from.lng) * toRad;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

export type CompassPoint = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

const COMPASS_ORDER: CompassPoint[] = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];

export function compassPoint(bearing: number): CompassPoint {
  const normalized = ((bearing % 360) + 360) % 360;
  const index = Math.round(normalized / 45) % 8;
  return COMPASS_ORDER[index];
}

/**
 * Metres from a point to a segment, using an equirectangular projection
 * centred on the point. Accurate well past the scale of a city street, which
 * is all the off-route check needs.
 */
function metresToSegment(point: LatLng, start: LatLng, end: LatLng): number {
  const toRad = Math.PI / 180;
  const metresPerDegreeLat = 111320;
  const metresPerDegreeLng = 111320 * Math.cos(point.lat * toRad);

  const px = (point.lng - start.lng) * metresPerDegreeLng;
  const py = (point.lat - start.lat) * metresPerDegreeLat;
  const sx = (end.lng - start.lng) * metresPerDegreeLng;
  const sy = (end.lat - start.lat) * metresPerDegreeLat;

  const segmentLengthSquared = sx * sx + sy * sy;
  if (segmentLengthSquared === 0) return Math.sqrt(px * px + py * py);

  // Clamp keeps the projection inside the segment instead of running off the
  // infinite line, which would under-report distance near a turn.
  let t = (px * sx + py * sy) / segmentLengthSquared;
  t = Math.max(0, Math.min(1, t));

  const dx = px - t * sx;
  const dy = py - t * sy;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Shortest distance in metres from the traveller to the drawn route. */
export function metresFromRoute(point: LatLng, geometry: RoutePoint[]): number {
  if (geometry.length === 0) return Number.POSITIVE_INFINITY;
  if (geometry.length === 1) {
    return metresBetween(point, { lat: geometry[0][1], lng: geometry[0][0] });
  }

  let closest = Number.POSITIVE_INFINITY;
  for (let i = 0; i < geometry.length - 1; i += 1) {
    const start = { lat: geometry[i][1], lng: geometry[i][0] };
    const end = { lat: geometry[i + 1][1], lng: geometry[i + 1][0] };
    const distance = metresToSegment(point, start, end);
    if (distance < closest) closest = distance;
  }
  return closest;
}

export type GuardianState = "arrived" | "off_route" | "poor_signal" | "on_route";

export interface GuardianInput {
  position: LatLng;
  accuracyMetres: number | null;
  destination: LatLng;
  geometry: RoutePoint[];
}

export interface GuardianReading {
  state: GuardianState;
  metresRemaining: number;
  metresFromRoute: number;
  bearingToDestination: number;
  heading: CompassPoint;
}

/**
 * One pass of the guardian. Arrival wins over every warning: a traveller
 * standing at the door should be told they arrived, not that they strayed.
 */
export function readGuardian(input: GuardianInput): GuardianReading {
  const metresRemaining = metresBetween(input.position, input.destination);
  const offBy = metresFromRoute(input.position, input.geometry);
  const bearing = bearingDegrees(input.position, input.destination);

  let state: GuardianState = "on_route";
  if (metresRemaining <= ARRIVAL_RADIUS_METRES) {
    state = "arrived";
  } else if (input.accuracyMetres !== null && input.accuracyMetres > POOR_ACCURACY_METRES) {
    // Do not accuse the traveller of leaving the route on a fix too coarse to prove it.
    state = "poor_signal";
  } else if (offBy > OFF_ROUTE_RADIUS_METRES) {
    state = "off_route";
  }

  return {
    state,
    metresRemaining: Math.round(metresRemaining),
    metresFromRoute: Math.round(offBy),
    bearingToDestination: Math.round(bearing),
    heading: compassPoint(bearing),
  };
}

/** Share of the journey already covered, 0 to 1. */
export function progressRatio(totalMetres: number, remainingMetres: number): number {
  if (totalMetres <= 0) return 1;
  const done = (totalMetres - remainingMetres) / totalMetres;
  return Math.max(0, Math.min(1, done));
}

/** Seconds left at the plan's own average pace. */
export function remainingSeconds(plan: RoutePlan, metresRemaining: number): number {
  const speed = plan.distanceMeters > 0 && plan.durationSeconds > 0
    ? plan.distanceMeters / plan.durationSeconds
    : FALLBACK_SPEED_METRES_PER_SECOND[plan.mode];
  if (speed <= 0) return 0;
  return Math.round(metresRemaining / speed);
}
