import { describe, expect, it } from "vitest";
import { buildOsrmUrl, coarsenForProvider, publicRouterAllowed, resolveRoutingEndpoint } from "../src/lib/navigation/providers";
import { createSpacer } from "../src/lib/navigation/spacer";
import { parseOsrmRoute, readGeometry } from "../src/lib/navigation/osrm";
import {
  canRouteFromFix,
  classifyGeolocationError,
  readDirect,
  readGuardian,
  routeMetresRemaining,
  type RoutePoint,
} from "../src/lib/navigation/route";

const FROM = { lat: 31.6295, lng: -8.0089 };
const TO = { lat: 31.6258, lng: -7.989 };

function okPayload(distance: number, duration: number, geometry: RoutePoint[]) {
  return { code: "Ok", routes: [{ distance, duration, geometry: { coordinates: geometry } }] };
}

// A short street-like polyline from FROM to TO with a corner in the middle.
const LINE: RoutePoint[] = [
  [FROM.lng, FROM.lat],
  [-8.0, FROM.lat],
  [-8.0, TO.lat],
  [TO.lng, TO.lat],
];

describe("routing provider selection", () => {
  it("uses the public foot instance for walking and the car instance for driving by default", () => {
    const walking = resolveRoutingEndpoint("walking", {});
    const driving = resolveRoutingEndpoint("driving", {});
    expect(walking.baseUrl).toBe("https://routing.openstreetmap.de/routed-foot");
    expect(walking.profile).toBe("foot");
    expect(walking.kind).toBe("public-experimental");
    expect(driving.baseUrl).toBe("https://routing.openstreetmap.de/routed-car");
    expect(driving.profile).toBe("driving");
  });

  it("never sends walking to the car-only OSRM demo server, even when configured", () => {
    const env = { ROUTING_OSRM_URL: "https://router.project-osrm.org/" };
    expect(resolveRoutingEndpoint("walking", env).baseUrl).toBe("https://routing.openstreetmap.de/routed-foot");
    expect(resolveRoutingEndpoint("driving", env).baseUrl).toBe("https://router.project-osrm.org");
  });

  it("honours a self-hosted multi-profile server for both modes", () => {
    const env = { ROUTING_OSRM_URL: "https://osrm.example.com/" };
    const walking = resolveRoutingEndpoint("walking", env);
    expect(walking).toEqual({ baseUrl: "https://osrm.example.com", profile: "foot", kind: "configured" });
    expect(resolveRoutingEndpoint("driving", env).profile).toBe("driving");
  });

  it("lets a per-mode URL win over the shared one", () => {
    const env = { ROUTING_OSRM_URL: "https://shared.example.com", ROUTING_WALKING_URL: "https://foot.example.com" };
    expect(resolveRoutingEndpoint("walking", env).baseUrl).toBe("https://foot.example.com");
    expect(resolveRoutingEndpoint("driving", env).baseUrl).toBe("https://shared.example.com");
  });

  it("ignores malformed or credential-bearing URLs", () => {
    expect(resolveRoutingEndpoint("walking", { ROUTING_WALKING_URL: "not a url" }).kind).toBe("public-experimental");
    expect(resolveRoutingEndpoint("walking", { ROUTING_WALKING_URL: "https://u:p@host.example" }).kind).toBe("public-experimental");
    expect(resolveRoutingEndpoint("walking", { ROUTING_WALKING_URL: "ftp://host.example" }).kind).toBe("public-experimental");
  });

  it("builds an OSRM URL in lng,lat order", () => {
    const url = buildOsrmUrl(resolveRoutingEndpoint("walking", {}), FROM, TO);
    expect(url).toContain("/route/v1/foot/-8.0089,31.6295;-7.989,31.6258?");
    expect(url).toContain("geometries=geojson");
  });
});

describe("OSRM response validation", () => {
  it("accepts a plausible walking route and keeps the provider time", () => {
    const result = parseOsrmRoute(okPayload(2485, 1988, LINE), FROM, TO, "walking", "public-experimental");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.durationBasis).toBe("provider");
    expect(result.plan.distanceMeters).toBe(2485);
    expect(result.plan.originOffsetMeters).toBe(0);
  });

  it("rejects a 'walking' answer at car speed (engine ignored the foot profile)", () => {
    // The OSRM demo server answered foot requests with 2588.7 m in 333.6 s.
    const result = parseOsrmRoute(okPayload(2588.7, 333.6, LINE), FROM, TO, "walking", "configured");
    expect(result).toEqual({ ok: false, code: "profile_mismatch" });
  });

  it("accepts the same car-speed answer for driving", () => {
    expect(parseOsrmRoute(okPayload(2588.7, 333.6, LINE), FROM, TO, "driving", "configured").ok).toBe(true);
  });

  it("derives a walking time at a fixed pace only when the engine gives none", () => {
    const result = parseOsrmRoute(okPayload(1250, 0, LINE), FROM, TO, "walking", "configured");
    expect(result.ok && result.plan.durationBasis).toBe("pace");
    expect(result.ok && result.plan.durationSeconds).toBe(1000);
  });

  it("refuses to invent a driving time", () => {
    expect(parseOsrmRoute(okPayload(1250, 0, LINE), FROM, TO, "driving", "configured")).toEqual({ ok: false, code: "route_unavailable" });
  });

  it("maps engine NoRoute to no_route_nearby and other codes to route_unavailable", () => {
    expect(parseOsrmRoute({ code: "NoRoute" }, FROM, TO, "walking", "configured")).toEqual({ ok: false, code: "no_route_nearby" });
    expect(parseOsrmRoute({ code: "InvalidQuery" }, FROM, TO, "walking", "configured")).toEqual({ ok: false, code: "route_unavailable" });
  });

  it("rejects empty or single-point geometry", () => {
    expect(parseOsrmRoute(okPayload(100, 80, []), FROM, TO, "walking", "configured").ok).toBe(false);
    expect(parseOsrmRoute(okPayload(100, 80, [[FROM.lng, FROM.lat]]), FROM, TO, "walking", "configured").ok).toBe(false);
    expect(parseOsrmRoute({ code: "Ok", routes: [] }, FROM, TO, "walking", "configured").ok).toBe(false);
  });

  it("rejects a route that starts or ends far from the requested points", () => {
    const farEnd: RoutePoint[] = [
      [FROM.lng, FROM.lat],
      [TO.lng + 0.05, TO.lat],
    ];
    expect(parseOsrmRoute(okPayload(2000, 1600, farEnd), FROM, TO, "walking", "configured")).toEqual({ ok: false, code: "no_route_nearby" });
  });

  it("reports how far the line ends from the pin", () => {
    const nearEnd: RoutePoint[] = [
      [FROM.lng, FROM.lat],
      [TO.lng + 0.002, TO.lat],
    ];
    const result = parseOsrmRoute(okPayload(2000, 1600, nearEnd), FROM, TO, "walking", "configured");
    expect(result.ok && result.plan.destinationOffsetMeters).toBeGreaterThan(150);
  });

  it("drops invalid coordinates from geometry", () => {
    expect(readGeometry([[1, 2], [999, 2], ["x", 1], [3], null, [4, 5]])).toEqual([
      [1, 2],
      [4, 5],
    ]);
  });
});

describe("geolocation handling", () => {
  it("maps browser error codes", () => {
    expect(classifyGeolocationError(1)).toBe("denied");
    expect(classifyGeolocationError(2)).toBe("unavailable");
    expect(classifyGeolocationError(3)).toBe("timeout");
    expect(classifyGeolocationError(99)).toBe("unavailable");
  });

  it("refuses to route from a cell-tower-level fix", () => {
    expect(canRouteFromFix(null)).toBe(true);
    expect(canRouteFromFix(25)).toBe(true);
    expect(canRouteFromFix(1000)).toBe(true);
    expect(canRouteFromFix(4500)).toBe(false);
  });
});

describe("guardian readings", () => {
  it("measures remaining distance along the route, not as the crow flies", () => {
    // Standing at the start of an L-shaped route: the road is longer than the straight line.
    const straight = readGuardian({ position: FROM, accuracyMetres: 10, destination: TO, geometry: LINE }).metresRemaining;
    const alongRoute = routeMetresRemaining(FROM, LINE);
    expect(alongRoute).toBeGreaterThan(straight);
  });

  it("shrinks as the traveller moves along the route and reaches ~0 at the end", () => {
    const atStart = routeMetresRemaining(FROM, LINE);
    const atCorner = routeMetresRemaining({ lat: FROM.lat, lng: -8.0 }, LINE);
    const atEnd = routeMetresRemaining(TO, LINE);
    expect(atCorner).toBeLessThan(atStart);
    expect(atEnd).toBeLessThan(5);
  });

  it("reports arrival, then poor signal, otherwise only a bare direct reading without a route", () => {
    expect(readDirect(TO, 10, TO).state).toBe("arrived");
    expect(readDirect(FROM, 200, TO).state).toBe("poor_signal");
    const direct = readDirect(FROM, 10, TO);
    expect(direct.state).toBe("no_route");
    expect(direct.straightMetres).toBeGreaterThan(1500);
  });
});

describe("routing provider compliance and privacy", () => {
  it("does not allow the community router in production unless the owner opts in", () => {
    expect(publicRouterAllowed({ NODE_ENV: "development" })).toBe(true);
    expect(publicRouterAllowed({ NODE_ENV: "test" })).toBe(true);
    expect(publicRouterAllowed({ NODE_ENV: "production" })).toBe(false);
    expect(publicRouterAllowed({ NODE_ENV: "production", ROUTING_ALLOW_PUBLIC_EXPERIMENTAL: "yes" })).toBe(false);
    expect(publicRouterAllowed({ NODE_ENV: "production", ROUTING_ALLOW_PUBLIC_EXPERIMENTAL: "true" })).toBe(true);
  });

  it("rounds a traveller's position to about 10 m before it leaves", () => {
    expect(coarsenForProvider({ lat: 31.629512345, lng: -8.008987654 })).toEqual({ lat: 31.6295, lng: -8.009 });
    expect(coarsenForProvider({ lat: -0.00004, lng: 0.00006 })).toEqual({ lat: -0, lng: 0.0001 });
  });

  it("spaces requests to the public router at least one interval apart, process-wide", async () => {
    let clock = 10_000;
    const slept: number[] = [];
    const spacer = createSpacer({
      intervalMs: 1100,
      maxWaitMs: 3500,
      maxWaiting: 3,
      now: () => clock,
      sleep: async (ms) => {
        slept.push(ms);
        clock += ms;
      },
    });
    expect(await spacer.take()).toBe(true); // first goes straight through
    expect(slept).toEqual([]);
    expect(await spacer.take()).toBe(true); // second waits a full interval
    expect(slept).toEqual([1100]);
    expect(await spacer.take()).toBe(true);
    expect(slept).toEqual([1100, 1100]);
  });

  it("gives up instead of queueing forever", async () => {
    const clock = 0;
    const spacer = createSpacer({ intervalMs: 1100, maxWaitMs: 2000, maxWaiting: 5, now: () => clock, sleep: () => new Promise(() => undefined) });
    expect(await spacer.take()).toBe(true); // slot 0
    void spacer.take(); // slot 1100 (waits, never resolves)
    // the next would wait 2200 ms > 2000 ms: refused, and the refusal must not consume a slot
    expect(await spacer.take()).toBe(false);
    expect(await spacer.take()).toBe(false);
  });

  it("caps how many callers may wait at once", async () => {
    const spacer = createSpacer({ intervalMs: 10, maxWaitMs: 10_000, maxWaiting: 2, now: () => 0, sleep: () => new Promise(() => undefined) });
    await spacer.take(); // immediate
    void spacer.take();
    void spacer.take();
    expect(await spacer.take()).toBe(false);
  });
});
