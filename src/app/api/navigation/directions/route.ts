import { NextResponse } from "next/server";
import { z } from "zod";
import { zodErrorResponse } from "@/lib/api-utils";
import { checkRateLimit, clientKeyFromRequest } from "@/lib/rate-limit";
import { parseJsonResponseWithLimit } from "@/lib/http/bounded-body";
import {
  MAX_WALKING_STRAIGHT_METRES,
  isTravelMode,
  metresBetween,
  type DirectionsFailureCode,
  type LatLng,
  type TravelMode,
} from "@/lib/navigation/route";
import { parseOsrmRoute, type OsrmResponse } from "@/lib/navigation/osrm";
import { buildOsrmUrl, coarsenForProvider, publicRouterAllowed, resolveRoutingEndpoint, type RoutingEndpoint } from "@/lib/navigation/providers";
import { publicRouterSpacer } from "@/lib/navigation/spacer";
import { isTrustedMutationRequest } from "@/lib/security/mutation-origin";
import { parseJsonBodyWithLimit } from "@/lib/http/bounded-body";

// Directions for the in-app navigation screen.
//
// This endpoint only ever answers with a REAL route from a routing engine, or
// with an explicit failure. It never returns a straight line as if it were a
// road, never reuses car geometry for a pedestrian, and never invents a
// distance or ETA. On failure it still reports the measured straight-line
// distance (clearly a different quantity) so the screen can stay useful.
//
// Provider choice, limits and licence notes: src/lib/navigation/providers.ts.
//
// Privacy: the traveller's position is personal data. It is rounded to ~10 m
// before it leaves for a routing provider, never written to our logs, and the
// app sends it in a POST body (a GET puts coordinates in the URL, which
// platform HTTP logs record). GET is kept for diagnostics only.

export const dynamic = "force-dynamic";

const querySchema = z.object({
  fromLat: z.coerce.number().min(-90).max(90),
  fromLng: z.coerce.number().min(-180).max(180),
  toLat: z.coerce.number().min(-90).max(90),
  toLng: z.coerce.number().min(-180).max(180),
  mode: z.string().optional(),
});

const OSRM_TIMEOUT_MS = 6000;
const MAX_ROUTE_BYTES = 1024 * 1024;

type FetchOutcome = { kind: "payload"; payload: OsrmResponse } | { kind: "failed"; retryable: boolean };

async function askOsrm(endpoint: RoutingEndpoint, from: LatLng, to: LatLng): Promise<FetchOutcome> {
  // The community router allows 1 request/second for everyone: wait for a
  // slot, or fail honestly rather than breach it.
  if (endpoint.kind === "public-experimental" && !(await publicRouterSpacer.take())) {
    return { kind: "failed", retryable: true };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS);
  try {
    const response = await fetch(buildOsrmUrl(endpoint, from, to), {
      signal: controller.signal,
      // Public community routing servers ask clients to identify themselves.
      headers: { Accept: "application/json", "User-Agent": "MySindbad/1.0 (travel app; routing client)" },
    });
    // 4xx from OSRM carries a JSON body with a code like NoRoute; 5xx / 429 are transient.
    if (response.status >= 500 || response.status === 429) return { kind: "failed", retryable: true };
    const payload = await parseJsonResponseWithLimit<OsrmResponse>(response, MAX_ROUTE_BYTES);
    return { kind: "payload", payload };
  } catch {
    return { kind: "failed", retryable: true };
  } finally {
    clearTimeout(timer);
  }
}

function failure(code: DirectionsFailureCode, status: number, straightLineMeters: number, retryable: boolean) {
  return NextResponse.json({ error: code, retryable, straightLineMeters: Math.round(straightLineMeters) }, { status });
}

async function respond(request: Request, input: Record<string, unknown>) {
  const rate = await checkRateLimit(clientKeyFromRequest(request, "navigation-directions"), 120, 10 * 60 * 1000);
  if (!rate.allowed) return NextResponse.json({ error: "Too many route requests. Please slow down." }, { status: 429 });

  const parsed = querySchema.safeParse(input);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const requestedMode = parsed.data.mode;
  if (requestedMode !== undefined && !isTravelMode(requestedMode)) {
    return failure("invalid_request", 400, 0, false);
  }
  const mode: TravelMode = requestedMode ?? "walking";
  const to = { lat: parsed.data.toLat, lng: parsed.data.toLng };
  // The traveller's position is rounded (~10 m) before it goes anywhere. The
  // destination is a public place pin and is sent as stored.
  const from = coarsenForProvider({ lat: parsed.data.fromLat, lng: parsed.data.fromLng });
  const straight = metresBetween(from, to);

  if (mode === "walking" && straight > MAX_WALKING_STRAIGHT_METRES) {
    return failure("too_far_for_walking", 422, straight, false);
  }

  const endpoint = resolveRoutingEndpoint(mode);

  // Production never falls back to the community router unless the owner has
  // opted in (providers.ts). Nothing is sent anywhere in that case.
  if (endpoint.kind === "public-experimental" && !publicRouterAllowed()) {
    return failure("provider_not_configured", 503, straight, false);
  }

  let outcome = await askOsrm(endpoint, from, to);
  if (outcome.kind === "failed" && outcome.retryable) outcome = await askOsrm(endpoint, from, to);
  if (outcome.kind === "failed") return failure("route_unavailable", 503, straight, true);

  const result = parseOsrmRoute(outcome.payload, from, to, mode, endpoint.kind);
  if (!result.ok) {
    // profile_mismatch means the configured engine answered a walking request
    // with vehicle speeds: a configuration error, not something to retry.
    if (result.code === "profile_mismatch") {
      console.error("Routing engine returned a vehicle-speed route for a walking request.", { baseUrl: endpoint.baseUrl });
      return failure("profile_mismatch", 503, straight, false);
    }
    const status = result.code === "no_route_nearby" ? 422 : 503;
    return failure(result.code, status, straight, result.code === "route_unavailable");
  }

  return NextResponse.json({ route: result.plan });
}

// The app calls this: coordinates travel in the body, not the URL.
export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return failure("invalid_request", 403, 0, false);
  const json = await parseJsonBodyWithLimit(request, 2 * 1024);
  if (!json.ok || !json.body || typeof json.body !== "object") return failure("invalid_request", 400, 0, false);
  return respond(request, json.body as Record<string, unknown>);
}

// Diagnostics only (curl / QA). Query strings are recorded by platform HTTP
// logs, so the app itself never uses this.
export async function GET(request: Request) {
  const url = new URL(request.url);
  return respond(request, {
    fromLat: url.searchParams.get("fromLat"),
    fromLng: url.searchParams.get("fromLng"),
    toLat: url.searchParams.get("toLat"),
    toLng: url.searchParams.get("toLng"),
    mode: url.searchParams.get("mode") ?? undefined,
  });
}
