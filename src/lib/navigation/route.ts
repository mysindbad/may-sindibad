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

/**
 * A real road/path route from a routing engine. There is deliberately no
 * "estimate" variant: when no engine answers, the API reports a failure
 * instead of a straight line dressed up as a route.
 */
export interface RoutePlan {
  mode: TravelMode;
  distanceMeters: number;
  durationSeconds: number;
  /** "provider" = the engine's own time; "pace" = derived from road distance at a fixed walking pace. */
  durationBasis: "provider" | "pace";
  geometry: RoutePoint[];
  /** How far the drawn line starts from the traveller's point, because engines snap to the nearest road. */
  originOffsetMeters: number;
  /** How far the drawn line ends from the destination pin. */
  destinationOffsetMeters: number;
  /** Which routing configuration produced this plan, for attribution. */
  provider: "configured" | "public-experimental" | "geoapify";
}

export type DirectionsFailureCode =
  | "route_unavailable"
  | "no_route_nearby"
  | "too_far_for_walking"
  | "profile_mismatch"
  | "provider_not_configured"
  | "routing_paused"
  | "too_far_to_route"
  | "invalid_request";

/** Pace used only to re-derive a walking time when an engine's own time is not credible. */
export const WALKING_PACE_METRES_PER_SECOND = 1.25;
const FALLBACK_SPEED_METRES_PER_SECOND: Record<TravelMode, number> = {
  walking: WALKING_PACE_METRES_PER_SECOND,
  driving: 8.5,
};

/** Beyond this straight-line distance a walking route is not offered at all. */
export const MAX_WALKING_STRAIGHT_METRES = 30000;

/** A fix coarser than this cannot anchor a route at all (cell-tower level). */
export const UNUSABLE_ACCURACY_METRES = 1000;

export type GeolocationFailure = "denied" | "unavailable" | "timeout";

/** Maps GeolocationPositionError.code (1, 2, 3) to a stable name. */
export function classifyGeolocationError(code: number): GeolocationFailure {
  if (code === 1) return "denied";
  if (code === 3) return "timeout";
  return "unavailable";
}

/** Whether a position fix is precise enough to compute a route from. */
export function canRouteFromFix(accuracyMetres: number | null): boolean {
  return accuracyMetres === null || accuracyMetres <= UNUSABLE_ACCURACY_METRES;
}

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
function projectOnSegment(point: LatLng, start: LatLng, end: LatLng): { distance: number; t: number } {
  const toRad = Math.PI / 180;
  const metresPerDegreeLat = 111320;
  const metresPerDegreeLng = 111320 * Math.cos(point.lat * toRad);

  const px = (point.lng - start.lng) * metresPerDegreeLng;
  const py = (point.lat - start.lat) * metresPerDegreeLat;
  const sx = (end.lng - start.lng) * metresPerDegreeLng;
  const sy = (end.lat - start.lat) * metresPerDegreeLat;

  const segmentLengthSquared = sx * sx + sy * sy;
  if (segmentLengthSquared === 0) return { distance: Math.sqrt(px * px + py * py), t: 0 };

  // Clamp keeps the projection inside the segment instead of running off the
  // infinite line, which would under-report distance near a turn.
  let t = (px * sx + py * sy) / segmentLengthSquared;
  t = Math.max(0, Math.min(1, t));

  const dx = px - t * sx;
  const dy = py - t * sy;
  return { distance: Math.sqrt(dx * dx + dy * dy), t };
}

function metresToSegment(point: LatLng, start: LatLng, end: LatLng): number {
  return projectOnSegment(point, start, end).distance;
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

/**
 * Metres still to travel ALONG the drawn route from the traveller's closest
 * point on it to its end. Unlike the straight-line distance to the pin this
 * respects the road, so the remaining distance and ETA do not shrink while
 * the traveller is walking away from the destination around a block.
 */
export function routeMetresRemaining(point: LatLng, geometry: RoutePoint[]): number {
  if (geometry.length < 2) return Number.POSITIVE_INFINITY;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestIndex = 0;
  let bestT = 0;
  for (let i = 0; i < geometry.length - 1; i += 1) {
    const start = { lat: geometry[i][1], lng: geometry[i][0] };
    const end = { lat: geometry[i + 1][1], lng: geometry[i + 1][0] };
    const hit = projectOnSegment(point, start, end);
    if (hit.distance < bestDistance) {
      bestDistance = hit.distance;
      bestIndex = i;
      bestT = hit.t;
    }
  }
  const a = { lat: geometry[bestIndex][1], lng: geometry[bestIndex][0] };
  const b = { lat: geometry[bestIndex + 1][1], lng: geometry[bestIndex + 1][0] };
  let remaining = metresBetween(a, b) * (1 - bestT);
  for (let i = bestIndex + 1; i < geometry.length - 1; i += 1) {
    remaining += metresBetween({ lat: geometry[i][1], lng: geometry[i][0] }, { lat: geometry[i + 1][1], lng: geometry[i + 1][0] });
  }
  return remaining;
}

export interface DirectReading {
  state: "arrived" | "poor_signal" | "no_route";
  /** Measured straight-line distance. It is NOT a road distance and must be labelled so. */
  straightMetres: number;
  bearingToDestination: number;
  heading: CompassPoint;
}

/**
 * What can honestly be said with no route: how far away the destination is as
 * the crow flies and in which direction. No ETA, progress or off-route claims.
 */
export function readDirect(position: LatLng, accuracyMetres: number | null, destination: LatLng): DirectReading {
  const straight = metresBetween(position, destination);
  const bearing = bearingDegrees(position, destination);
  let state: DirectReading["state"] = "no_route";
  if (straight <= ARRIVAL_RADIUS_METRES) state = "arrived";
  else if (accuracyMetres !== null && accuracyMetres > POOR_ACCURACY_METRES) state = "poor_signal";
  return { state, straightMetres: Math.round(straight), bearingToDestination: Math.round(bearing), heading: compassPoint(bearing) };
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
