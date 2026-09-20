import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, zodErrorResponse } from "@/lib/api-utils";
import { checkRateLimit, clientKeyFromRequest } from "@/lib/rate-limit";
import { parseJsonResponseWithLimit } from "@/lib/http/bounded-body";
import { estimateRoute, isTravelMode, type RoutePlan, type RoutePoint, type TravelMode } from "@/lib/navigation/route";

// Directions for the in-app navigation screen.
//
// A routing engine is optional on purpose. When ROUTING_OSRM_URL points at an
// OSRM-compatible server the traveller gets a real street path; when it does
// not, or the server is slow or down, the endpoint still answers with a
// straight-line estimate. Navigation degrading to "it is 800 m north-east of
// you" is useful; navigation returning an error is not.

export const dynamic = "force-dynamic";

const querySchema = z.object({
  fromLat: z.coerce.number().min(-90).max(90),
  fromLng: z.coerce.number().min(-180).max(180),
  toLat: z.coerce.number().min(-90).max(90),
  toLng: z.coerce.number().min(-180).max(180),
  mode: z.string().optional(),
});

const DEFAULT_OSRM_URL = "https://router.project-osrm.org";
const OSRM_TIMEOUT_MS = 4500;
const MAX_ROUTE_BYTES = 512 * 1024;

/** OSRM profile names differ per deployment; these match the public builds. */
const PROFILE: Record<TravelMode, string> = { walking: "foot", driving: "driving" };

interface OsrmResponse {
  code?: string;
  routes?: Array<{
    distance?: number;
    duration?: number;
    geometry?: { coordinates?: unknown };
  }>;
}

function readGeometry(raw: unknown): RoutePoint[] {
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

async function askOsrm(
  baseUrl: string,
  profile: string,
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<{ distanceMeters: number; durationSeconds: number; geometry: RoutePoint[] } | null> {
  const coords = from.lng + "," + from.lat + ";" + to.lng + "," + to.lat;
  const url = baseUrl.replace(/\/+$/, "") + "/route/v1/" + profile + "/" + coords + "?overview=full&geometries=geojson&alternatives=false&steps=false";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!response.ok) return null;

    // The routing server is third-party input: bound it before parsing.
    const payload = await parseJsonResponseWithLimit<OsrmResponse>(response, MAX_ROUTE_BYTES);
    if (payload.code !== "Ok") return null;

    const route = payload.routes && payload.routes[0];
    if (!route) return null;

    const geometry = readGeometry(route.geometry && route.geometry.coordinates);
    if (geometry.length < 2) return null;

    const distanceMeters = Number(route.distance);
    const durationSeconds = Number(route.duration);
    if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) return null;

    return {
      distanceMeters: Math.round(distanceMeters),
      durationSeconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? Math.round(durationSeconds) : 0,
      geometry,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request: Request) {
  const rate = await checkRateLimit(clientKeyFromRequest(request, "navigation-directions"), 120, 10 * 60 * 1000);
  if (!rate.allowed) return jsonError("Too many route requests. Please slow down.", 429);

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    fromLat: url.searchParams.get("fromLat"),
    fromLng: url.searchParams.get("fromLng"),
    toLat: url.searchParams.get("toLat"),
    toLng: url.searchParams.get("toLng"),
    mode: url.searchParams.get("mode") ?? undefined,
  });
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const mode: TravelMode = parsed.data.mode && isTravelMode(parsed.data.mode) ? parsed.data.mode : "walking";
  const from = { lat: parsed.data.fromLat, lng: parsed.data.fromLng };
  const to = { lat: parsed.data.toLat, lng: parsed.data.toLng };

  const configured = process.env.ROUTING_OSRM_URL;
  const baseUrl = configured && configured.trim() ? configured.trim() : DEFAULT_OSRM_URL;

  let routed = await askOsrm(baseUrl, PROFILE[mode], from, to);
  if (!routed && mode === "walking") {
    // Many OSRM deployments only ship the car profile. A car's street path is
    // still a far better walking hint than a straight line across buildings.
    routed = await askOsrm(baseUrl, PROFILE.driving, from, to);
  }

  let plan: RoutePlan;
  if (routed) {
    const estimate = estimateRoute(from, to, mode);
    plan = {
      mode,
      source: "routed",
      distanceMeters: routed.distanceMeters,
      // A driving duration means nothing to someone on foot, so walking always
      // re-derives its own time from the real street distance.
      durationSeconds:
        mode === "walking" || routed.durationSeconds <= 0
          ? Math.round((routed.distanceMeters / Math.max(1, estimate.distanceMeters)) * estimate.durationSeconds)
          : routed.durationSeconds,
      geometry: routed.geometry,
    };
  } else {
    plan = estimateRoute(from, to, mode);
  }

  return NextResponse.json({ route: plan });
}
