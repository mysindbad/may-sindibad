import type { TravelMode } from "@/lib/navigation/route";

// Which routing engine answers for which travel mode. Kept apart from the
// HTTP route so provider choice, cost and licence decisions live in one place
// and can change without touching request handling.
//
// Why there is no single default engine:
//   * router.project-osrm.org (the "OSRM demo server") only serves the CAR
//     profile. It ignores /route/v1/foot/ and answers with the driving
//     geometry and driving time (verified 2026-11-02: identical 2588.7 m /
//     333.6 s for foot and driving). Using it for walking draws a car route
//     and a car ETA for a pedestrian, so it is never used for walking.
//   * routing.openstreetmap.de runs one OSRM instance per profile
//     (routed-foot, routed-car, routed-bike). It returns a genuinely different
//     pedestrian route. It is a free community service with a fair-use
//     policy and no uptime guarantee, so it is a development / low-volume
//     default only - production should set ROUTING_* to a self-hosted or
//     contracted engine.
//
// Environment (all optional):
//   ROUTING_OSRM_URL     Base URL of one self-hosted OSRM serving BOTH the
//                        "foot" and "driving" profiles at /route/v1/{profile}.
//   ROUTING_WALKING_URL  Base URL of an OSRM instance built from a foot profile.
//   ROUTING_DRIVING_URL  Base URL of an OSRM instance built from a car profile.
// Specific URLs win over ROUTING_OSRM_URL; any mode left unset falls back to
// the public experimental instance for that mode.

export interface RoutingEndpoint {
  baseUrl: string;
  /** Profile segment sent in /route/v1/{profile}/. Single-profile instances ignore it. */
  profile: "foot" | "driving";
  kind: "configured" | "public-experimental";
}

const PUBLIC_EXPERIMENTAL: Record<TravelMode, RoutingEndpoint> = {
  walking: { baseUrl: "https://routing.openstreetmap.de/routed-foot", profile: "foot", kind: "public-experimental" },
  driving: { baseUrl: "https://routing.openstreetmap.de/routed-car", profile: "driving", kind: "public-experimental" },
};

/** Hosts that are known to answer walking requests with car routes. */
const CAR_ONLY_HOSTS = new Set(["router.project-osrm.org"]);

function cleanBaseUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    return trimmed.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function resolveRoutingEndpoint(mode: TravelMode, env: Record<string, string | undefined> = process.env): RoutingEndpoint {
  const specific = cleanBaseUrl(mode === "walking" ? env.ROUTING_WALKING_URL : env.ROUTING_DRIVING_URL);
  const multi = cleanBaseUrl(env.ROUTING_OSRM_URL);
  const profile = mode === "walking" ? "foot" : "driving";

  const configured = specific ?? multi;
  // A configured car-only host must not serve walking: that is exactly the
  // failure this module exists to prevent, so walking falls through to the
  // public foot instance instead of silently drawing a car route.
  if (configured && !(mode === "walking" && CAR_ONLY_HOSTS.has(hostOf(configured)))) {
    return { baseUrl: configured, profile, kind: "configured" };
  }
  return PUBLIC_EXPERIMENTAL[mode];
}

export function buildOsrmUrl(
  endpoint: RoutingEndpoint,
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): string {
  const coords = from.lng + "," + from.lat + ";" + to.lng + "," + to.lat;
  return endpoint.baseUrl + "/route/v1/" + endpoint.profile + "/" + coords + "?overview=full&geometries=geojson&alternatives=false&steps=false";
}
