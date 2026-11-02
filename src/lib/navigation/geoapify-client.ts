import "server-only";
import { parseJsonResponseWithLimit } from "@/lib/http/bounded-body";
import type { DirectionsFailureCode, LatLng, RoutePlan, TravelMode } from "@/lib/navigation/route";
import {
  buildGeoapifyUrl,
  classifyGeoapifyStatus,
  failureForStatus,
  parseGeoapifyRoute,
  type GeoapifyResponse,
} from "@/lib/navigation/geoapify";

// One call to Geoapify, server to server. The API key lives only in this
// process: it is put in the request URL (the way the API requires) and then
// never appears anywhere else - not in a log, not in an error, not in a
// response to the browser. Nothing in here logs a URL, a coordinate, or an
// error message from the network layer (an undici error can embed the URL).

const TIMEOUT_MS = 6000;
const MAX_RESPONSE_BYTES = 1024 * 1024;

export type GeoapifyOutcome =
  | { kind: "route"; plan: RoutePlan }
  | { kind: "failure"; code: DirectionsFailureCode; retryable: boolean; trip: "auth" | "limit" | "transient" | "none" };

export interface GeoapifyDeps {
  fetchImpl: typeof fetch;
}

export async function fetchGeoapifyRoute(
  config: { apiKey: string; baseUrl: string },
  from: LatLng,
  to: LatLng,
  mode: TravelMode,
  deps: GeoapifyDeps = { fetchImpl: (input, init) => fetch(input, init) },
): Promise<GeoapifyOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await deps.fetchImpl(buildGeoapifyUrl(config.baseUrl, config.apiKey, from, to, mode), {
      signal: controller.signal,
      // The key is in the URL, so the response must not be cached or leaked via a referrer.
      cache: "no-store",
      referrerPolicy: "no-referrer",
      headers: { Accept: "application/json", "User-Agent": "MySindbad/1.0 (travel app; routing client)" },
    });

    const statusClass = classifyGeoapifyStatus(response.status);
    if (statusClass !== "ok") {
      // Drain nothing, read nothing: an error body is not needed and could echo input.
      const failure = failureForStatus(statusClass);
      const trip = statusClass === "auth" ? "auth" : statusClass === "limit" ? "limit" : statusClass === "unavailable" ? "transient" : "none";
      return { kind: "failure", code: failure.code, retryable: failure.retryable, trip };
    }

    const payload = await parseJsonResponseWithLimit<GeoapifyResponse>(response, MAX_RESPONSE_BYTES);
    const parsed = parseGeoapifyRoute(payload, from, to, mode);
    if (!parsed.ok) {
      return { kind: "failure", code: parsed.code, retryable: parsed.code === "route_unavailable", trip: "none" };
    }
    return { kind: "route", plan: parsed.plan };
  } catch {
    // Timeout, DNS, TLS, oversized or malformed body: all "not available right now".
    return { kind: "failure", code: "route_unavailable", retryable: true, trip: "transient" };
  } finally {
    clearTimeout(timer);
  }
}
