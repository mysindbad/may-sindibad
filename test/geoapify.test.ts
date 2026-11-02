import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildGeoapifyUrl,
  classifyGeoapifyStatus,
  extraCreditsForDistance,
  failureForStatus,
  orientGeometry,
  parseGeoapifyRoute,
  redactKey,
  type GeoapifyResponse,
} from "../src/lib/navigation/geoapify";
import { fetchGeoapifyRoute } from "../src/lib/navigation/geoapify-client";
import {
  createBreaker,
  createBudget,
  createRouteCache,
  killSwitchOn,
  readBudgetConfig,
  routeCacheKey,
  utcDayKey,
  type CounterStore,
} from "../src/lib/navigation/budget";
import { selectRoutingProvider } from "../src/lib/navigation/providers";
import type { RoutePoint } from "../src/lib/navigation/route";

const KEY = "test-key-DO-NOT-LEAK-9f3a1c";
const FROM = { lat: 31.6295, lng: -7.9811 };
const TO = { lat: 31.6342, lng: -7.9993 };

// A street-like path with a corner, in GeoJSON order [lon, lat].
const LEG_A: RoutePoint[] = [
  [FROM.lng, FROM.lat],
  [-7.99, FROM.lat],
  [-7.99, 31.632],
];
const LEG_B: RoutePoint[] = [
  [-7.99, 31.632], // legs share their joint vertex
  [TO.lng, TO.lat],
];

/** Shaped like the documented GeoJSON answer: FeatureCollection, one feature, MultiLineString per leg. */
function answer(overrides: { distance?: unknown; time?: unknown; units?: unknown; geometry?: unknown } = {}): GeoapifyResponse {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          distance: overrides.distance ?? 2048,
          time: overrides.time ?? 1639,
          distance_units: overrides.units ?? "meters",
        },
        geometry: (overrides.geometry as { type: string; coordinates: unknown }) ?? { type: "MultiLineString", coordinates: [LEG_A, LEG_B] },
      },
    ],
  } as unknown as GeoapifyResponse;
}

afterEach(() => vi.restoreAllMocks());

describe("Geoapify request", () => {
  it("asks for the cheapest route: lat,lon order, walk/drive, no paid extras", () => {
    const walk = buildGeoapifyUrl("https://api.geoapify.com/", KEY, FROM, TO, "walking");
    const drive = buildGeoapifyUrl("https://api.geoapify.com", KEY, FROM, TO, "driving");
    const url = new URL(walk);
    expect(url.origin + url.pathname).toBe("https://api.geoapify.com/v1/routing");
    expect(url.searchParams.get("waypoints")).toBe("31.6295,-7.9811|31.6342,-7.9993");
    expect(url.searchParams.get("mode")).toBe("walk");
    expect(new URL(drive).searchParams.get("mode")).toBe("drive");
    expect(url.searchParams.get("apiKey")).toBe(KEY);
    // Each of these adds credits per the docs: never requested.
    for (const paid of ["details", "avoid", "traffic", "optimize_stops", "elevation"]) {
      expect(url.searchParams.has(paid), paid).toBe(false);
    }
    expect(url.searchParams.get("units")).toBe("metric");
  });

  it("redacts the key in raw and URL-encoded form", () => {
    const tricky = "a+b/c=d";
    const text = `GET /v1/routing?apiKey=${encodeURIComponent(tricky)} failed with ${tricky}`;
    expect(redactKey(text, tricky)).not.toContain(tricky);
    expect(redactKey(text, tricky)).not.toContain(encodeURIComponent(tricky));
    expect(redactKey("nothing here", "")).toBe("nothing here");
  });

  it("computes the extra credits long routes cost", () => {
    expect(extraCreditsForDistance(3_416)).toBe(0);
    expect(extraCreditsForDistance(499_999)).toBe(0);
    expect(extraCreditsForDistance(500_000)).toBe(1);
    expect(extraCreditsForDistance(1_250_000)).toBe(2);
  });

  it("classifies status codes without relying on undocumented bodies", () => {
    expect(classifyGeoapifyStatus(200)).toBe("ok");
    expect(classifyGeoapifyStatus(401)).toBe("auth");
    expect(classifyGeoapifyStatus(403)).toBe("auth");
    expect(classifyGeoapifyStatus(429)).toBe("limit");
    expect(classifyGeoapifyStatus(402)).toBe("limit");
    expect(classifyGeoapifyStatus(400)).toBe("bad_request");
    expect(classifyGeoapifyStatus(404)).toBe("bad_request");
    expect(classifyGeoapifyStatus(500)).toBe("unavailable");
    expect(classifyGeoapifyStatus(503)).toBe("unavailable");
    expect(failureForStatus("auth")).toEqual({ code: "provider_not_configured", retryable: false });
    expect(failureForStatus("limit")).toEqual({ code: "routing_paused", retryable: false });
    expect(failureForStatus("unavailable")).toEqual({ code: "route_unavailable", retryable: true });
  });
});

describe("Geoapify response validation", () => {
  it("accepts a walking route, joins legs without repeating the shared vertex", () => {
    const result = parseGeoapifyRoute(answer(), FROM, TO, "walking");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.provider).toBe("geoapify");
    expect(result.plan.distanceMeters).toBe(2048);
    expect(result.plan.durationSeconds).toBe(1639);
    expect(result.plan.durationBasis).toBe("provider");
    expect(result.plan.geometry).toHaveLength(4); // 3 + 2 - 1 shared
    expect(result.plan.geometry[0]).toEqual([FROM.lng, FROM.lat]);
  });

  it("accepts a driving route at driving speed", () => {
    expect(parseGeoapifyRoute(answer({ distance: 4638, time: 404 }), FROM, TO, "driving").ok).toBe(true);
  });

  it("accepts a plain LineString as well", () => {
    const geometry = { type: "LineString", coordinates: [...LEG_A, ...LEG_B.slice(1)] };
    expect(parseGeoapifyRoute(answer({ geometry }), FROM, TO, "walking").ok).toBe(true);
  });

  it("rejects 'walking' that is really car speed (never draw a car route for a walker)", () => {
    expect(parseGeoapifyRoute(answer({ distance: 2588, time: 333 }), FROM, TO, "walking")).toEqual({ ok: false, code: "profile_mismatch" });
  });

  it("detects [lat, lon] order instead of drawing the route in the wrong country", () => {
    const swapped = { type: "MultiLineString", coordinates: [LEG_A.map(([lng, lat]) => [lat, lng]), LEG_B.map(([lng, lat]) => [lat, lng])] };
    const result = parseGeoapifyRoute(answer({ geometry: swapped }), FROM, TO, "walking");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.geometry[0]).toEqual([FROM.lng, FROM.lat]); // normalised to [lng, lat]
    expect(result.plan.geometry[result.plan.geometry.length - 1]).toEqual([TO.lng, TO.lat]);
  });

  it("refuses geometry that fits neither order", () => {
    const elsewhere: RoutePoint[] = [
      [2.35, 48.85],
      [2.36, 48.86],
    ];
    expect(orientGeometry(elsewhere, FROM, TO)).toBeNull();
    expect(parseGeoapifyRoute(answer({ geometry: { type: "LineString", coordinates: elsewhere } }), FROM, TO, "walking")).toEqual({
      ok: false,
      code: "no_route_nearby",
    });
  });

  it("refuses imperial units rather than reading miles as metres", () => {
    expect(parseGeoapifyRoute(answer({ units: "Miles" }), FROM, TO, "walking")).toEqual({ ok: false, code: "route_unavailable" });
  });

  it("refuses empty, missing, or malformed answers (no blank success)", () => {
    expect(parseGeoapifyRoute({ type: "FeatureCollection", features: [] }, FROM, TO, "walking").ok).toBe(false);
    expect(parseGeoapifyRoute({} as GeoapifyResponse, FROM, TO, "walking").ok).toBe(false);
    expect(parseGeoapifyRoute(answer({ geometry: { type: "MultiLineString", coordinates: [] } }), FROM, TO, "walking")).toEqual({
      ok: false,
      code: "route_unavailable",
    });
    expect(parseGeoapifyRoute(answer({ geometry: { type: "Point", coordinates: [1, 2] } }), FROM, TO, "walking").ok).toBe(false);
    expect(parseGeoapifyRoute(answer({ distance: "far" }), FROM, TO, "walking").ok).toBe(false);
    expect(parseGeoapifyRoute(answer({ distance: 0 }), FROM, TO, "walking").ok).toBe(false);
  });

  it("will not invent a driving time", () => {
    const noTime = answer({ distance: 4638 });
    (noTime.features![0].properties as { time?: unknown }).time = null;
    expect(parseGeoapifyRoute(noTime, FROM, TO, "driving")).toEqual({ ok: false, code: "route_unavailable" });
  });
});

describe("Geoapify call (mocked network)", () => {
  const config = { apiKey: KEY, baseUrl: "https://api.geoapify.com" };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("returns a real route and sends the key only in the outbound request", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} });
      return json(answer());
    }) as typeof fetch;
    const outcome = await fetchGeoapifyRoute(config, FROM, TO, "walking", { fetchImpl });
    expect(outcome.kind).toBe("route");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("apiKey=" + KEY);
    expect(calls[0].init.cache).toBe("no-store");
    expect(calls[0].init.referrerPolicy).toBe("no-referrer");
    expect(JSON.stringify(outcome)).not.toContain(KEY); // nothing returned to the route handler carries the key
  });

  it.each([
    [401, "provider_not_configured", "auth"],
    [403, "provider_not_configured", "auth"],
    [429, "routing_paused", "limit"],
    [500, "route_unavailable", "transient"],
    [503, "route_unavailable", "transient"],
  ])("maps HTTP %i to an honest failure", async (status, code, trip) => {
    const fetchImpl = (async () => json({ statusCode: status, error: "x", message: `bad key ${KEY}` }, status)) as typeof fetch;
    const outcome = await fetchGeoapifyRoute(config, FROM, TO, "walking", { fetchImpl });
    expect(outcome).toMatchObject({ kind: "failure", code, trip });
    expect(JSON.stringify(outcome)).not.toContain(KEY); // an error body that echoes the key is never forwarded
  });

  it("treats network errors (even ones that embed the URL) as unavailable without leaking the key", async () => {
    const fetchImpl = (async () => {
      throw new Error(`fetch failed for https://api.geoapify.com/v1/routing?apiKey=${KEY}`);
    }) as typeof fetch;
    const outcome = await fetchGeoapifyRoute(config, FROM, TO, "walking", { fetchImpl });
    expect(outcome).toMatchObject({ kind: "failure", code: "route_unavailable", retryable: true, trip: "transient" });
    expect(JSON.stringify(outcome)).not.toContain(KEY);
  });

  it("treats malformed or oversized bodies as unavailable", async () => {
    const bad = (async () => new Response("<html>not json</html>", { status: 200 })) as typeof fetch;
    expect(await fetchGeoapifyRoute(config, FROM, TO, "walking", { fetchImpl: bad })).toMatchObject({ kind: "failure", code: "route_unavailable" });
    const huge = (async () => new Response(Buffer.alloc(2 * 1024 * 1024), { status: 200 })) as typeof fetch;
    expect(await fetchGeoapifyRoute(config, FROM, TO, "walking", { fetchImpl: huge })).toMatchObject({ kind: "failure", code: "route_unavailable" });
  });

  it("reports an unroutable pair as such, and a wrong-profile answer as a configuration problem", async () => {
    const empty = (async () => json({ type: "FeatureCollection", features: [] })) as typeof fetch;
    expect(await fetchGeoapifyRoute(config, FROM, TO, "walking", { fetchImpl: empty })).toMatchObject({ kind: "failure", code: "route_unavailable" });
    const carSpeed = (async () => json(answer({ distance: 2588, time: 333 }))) as typeof fetch;
    expect(await fetchGeoapifyRoute(config, FROM, TO, "walking", { fetchImpl: carSpeed })).toMatchObject({ kind: "failure", code: "profile_mismatch" });
  });

  it("never writes the key, a URL or a coordinate to any console channel", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => undefined));
    const fetchImpl = (async () => {
      throw new Error(`boom ${KEY} 31.6295`);
    }) as typeof fetch;
    await fetchGeoapifyRoute(config, FROM, TO, "walking", { fetchImpl });
    await fetchGeoapifyRoute(config, FROM, TO, "walking", { fetchImpl: (async () => json(answer())) as typeof fetch });
    await fetchGeoapifyRoute(config, FROM, TO, "walking", { fetchImpl: (async () => json({}, 401)) as typeof fetch });
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

describe("free-plan budget", () => {
  function memoryStore(): CounterStore & { counts: Map<string, number> } {
    const counts = new Map<string, number>();
    return {
      counts,
      async hit(key, limit) {
        const next = (counts.get(key) ?? 0) + 1;
        counts.set(key, next);
        return { allowed: next <= limit };
      },
    };
  }

  it("defaults far below the plan and can only be lowered, never raised past it", () => {
    expect(readBudgetConfig({})).toEqual({ dailyCredits: 400, perSecond: 2 });
    expect(readBudgetConfig({ GEOAPIFY_DAILY_BUDGET: "100", GEOAPIFY_MAX_PER_SECOND: "1" })).toEqual({ dailyCredits: 100, perSecond: 1 });
    // The plan is 5/s, but fixed windows can double a boundary burst: never above half.
    expect(readBudgetConfig({ GEOAPIFY_DAILY_BUDGET: "999999", GEOAPIFY_MAX_PER_SECOND: "50" })).toEqual({ dailyCredits: 3000, perSecond: 2 });
    expect(readBudgetConfig({ GEOAPIFY_MAX_PER_SECOND: "5" }).perSecond * 2).toBeLessThanOrEqual(5);
    expect(readBudgetConfig({ GEOAPIFY_DAILY_BUDGET: "-5", GEOAPIFY_MAX_PER_SECOND: "abc" })).toEqual({ dailyCredits: 400, perSecond: 2 });
  });

  it("allows exactly the daily budget, then refuses", async () => {
    const budget = createBudget(memoryStore(), { dailyCredits: 3, perSecond: 100 }, () => Date.UTC(2026, 10, 2, 12, 0, 0));
    expect(await budget.reserve()).toBe("ok");
    expect(await budget.reserve()).toBe("ok");
    expect(await budget.reserve()).toBe("ok");
    expect(await budget.reserve()).toBe("daily_exhausted");
    expect(await budget.reserve()).toBe("daily_exhausted");
  });

  it("starts a fresh budget on a new UTC day", async () => {
    let now = Date.UTC(2026, 10, 2, 23, 59, 59);
    const budget = createBudget(memoryStore(), { dailyCredits: 1, perSecond: 100 }, () => now);
    expect(await budget.reserve()).toBe("ok");
    expect(await budget.reserve()).toBe("daily_exhausted");
    now = Date.UTC(2026, 10, 3, 0, 0, 1);
    expect(await budget.reserve()).toBe("ok");
    expect(utcDayKey(Date.UTC(2026, 10, 3, 0, 0, 1))).toBe("2026-11-03");
  });

  it("limits the per-second rate without spending a daily credit", async () => {
    const store = memoryStore();
    const now = Date.UTC(2026, 10, 2, 12, 0, 0);
    const budget = createBudget(store, { dailyCredits: 100, perSecond: 2 }, () => now);
    expect(await budget.reserve()).toBe("ok");
    expect(await budget.reserve()).toBe("ok");
    expect(await budget.reserve()).toBe("rate_limited");
    expect(store.counts.get("geoapify:daily:2026-11-02")).toBe(2);
  });

  it("fails CLOSED when the shared counter cannot be proven", async () => {
    const broken: CounterStore = {
      async hit() {
        throw new Error("connection refused");
      },
    };
    expect(await createBudget(broken, { dailyCredits: 400, perSecond: 2 }).reserve()).toBe("unverifiable");
  });

  it("charges the extra credits a very long route costs", async () => {
    const store = memoryStore();
    const now = Date.UTC(2026, 10, 2, 12, 0, 0);
    const budget = createBudget(store, { dailyCredits: 400, perSecond: 100 }, () => now);
    await budget.reserve();
    await budget.settleExtra(2);
    expect(store.counts.get("geoapify:daily:2026-11-02")).toBe(3);
  });

  it("reads the kill switch strictly", () => {
    expect(killSwitchOn({})).toBe(false);
    expect(killSwitchOn({ ROUTING_KILL_SWITCH: "" })).toBe(false);
    expect(killSwitchOn({ ROUTING_KILL_SWITCH: "false" })).toBe(false);
    expect(killSwitchOn({ ROUTING_KILL_SWITCH: "true" })).toBe(true);
    expect(killSwitchOn({ ROUTING_KILL_SWITCH: "TRUE" })).toBe(true);
    expect(killSwitchOn({ ROUTING_KILL_SWITCH: "1" })).toBe(true);
  });
});

describe("circuit breaker and cache", () => {
  it("stays shut through isolated failures, opens after three in a row, closes by itself", () => {
    let now = 1000;
    const breaker = createBreaker(() => now);
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.status()).toBeNull();
    breaker.recordSuccess();
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.status()).toBeNull();
    breaker.recordFailure();
    expect(breaker.status()?.reason).toBe("failures");
    now += 31_000;
    expect(breaker.status()).toBeNull();
  });

  it("stops calling for minutes after a limit or a rejected key", () => {
    let now = 0;
    const breaker = createBreaker(() => now);
    breaker.tripLimit();
    expect(breaker.status()?.reason).toBe("limit");
    now += 4 * 60_000;
    expect(breaker.status()?.reason).toBe("limit");
    now += 2 * 60_000;
    expect(breaker.status()).toBeNull();
    breaker.tripAuth();
    now += 9 * 60_000;
    expect(breaker.status()?.reason).toBe("auth");
    now += 2 * 60_000;
    expect(breaker.status()).toBeNull();
  });

  it("serves an identical route from memory until it expires, and stays bounded", () => {
    let now = 0;
    const cache = createRouteCache<string>({ ttlMs: 90_000, maxEntries: 2, now: () => now });
    cache.set("a", "A");
    expect(cache.get("a")).toBe("A");
    now += 91_000;
    expect(cache.get("a")).toBeUndefined();
    cache.set("a", "A");
    cache.set("b", "B");
    cache.set("c", "C"); // evicts the oldest
    expect(cache.size()).toBe(2);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("c")).toBe("C");
  });

  it("treats positions within ~10 m as the same route", () => {
    const base = routeCacheKey({ lat: 31.62951, lng: -7.98111 }, TO, "walking");
    expect(routeCacheKey({ lat: 31.62954, lng: -7.98114 }, TO, "walking")).toBe(base);
    expect(routeCacheKey({ lat: 31.6305, lng: -7.9811 }, TO, "walking")).not.toBe(base);
    expect(routeCacheKey({ lat: 31.62951, lng: -7.98111 }, TO, "driving")).not.toBe(base);
  });
});

describe("provider selection", () => {
  it("uses Geoapify when a key exists and nothing says otherwise", () => {
    expect(selectRoutingProvider({ GEOAPIFY_API_KEY: KEY })).toEqual({ kind: "geoapify", apiKey: KEY, baseUrl: "https://api.geoapify.com" });
  });

  it("uses OSRM when there is no key", () => {
    expect(selectRoutingProvider({})).toEqual({ kind: "osrm" });
    expect(selectRoutingProvider({ GEOAPIFY_API_KEY: "   " })).toEqual({ kind: "osrm" });
  });

  it("lets the owner choose OSRM even when a key is present", () => {
    expect(selectRoutingProvider({ ROUTING_PROVIDER: "osrm", GEOAPIFY_API_KEY: KEY })).toEqual({ kind: "osrm" });
  });

  it("refuses to quietly use another service when Geoapify was requested without a key", () => {
    expect(selectRoutingProvider({ ROUTING_PROVIDER: "geoapify" })).toEqual({ kind: "none" });
    expect(selectRoutingProvider({ ROUTING_PROVIDER: "Geoapify", GEOAPIFY_API_KEY: KEY }).kind).toBe("geoapify");
  });

  it("ignores a base-URL override in production (it would send the key and positions elsewhere)", () => {
    const env = { GEOAPIFY_API_KEY: KEY, GEOAPIFY_BASE_URL: "http://127.0.0.1:4567" };
    expect(selectRoutingProvider({ ...env, NODE_ENV: "production" })).toMatchObject({ baseUrl: "https://api.geoapify.com" });
    expect(selectRoutingProvider({ ...env, NODE_ENV: "development" })).toMatchObject({ baseUrl: "http://127.0.0.1:4567" });
  });
});
