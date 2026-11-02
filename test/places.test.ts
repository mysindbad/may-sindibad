import { describe, expect, it } from "vitest";
import { isGoogleShortLink, isKnownMapHost, parseLocationInput } from "../src/lib/places/map-link";
import { checkPublicHttpUrl, isPrivateOrReservedIp } from "../src/lib/places/url-safety";
import { isInternalCoverUrl, placeCreateSchema, placeUpdateSchema, publishBlockers } from "../src/lib/places/place-input";
import { verifyRemoteImage, type RemoteImageDeps } from "../src/lib/places/remote-image";
import { resolveGoogleShortLink } from "../src/lib/places/short-link";

describe("map link / coordinate parsing", () => {
  it("reads the place pin (!3d!4d) in preference to the viewport centre", () => {
    const url =
      "https://www.google.com/maps/place/Jemaa+el-Fnaa/@31.6258,-7.9891,17z/data=!3m1!4b1!4m6!3m5!1s0xdafee:0x1!8m2!3d31.625903!4d-7.989083!16zL20";
    const result = parseLocationInput(url);
    expect(result).toEqual({ ok: true, location: { lat: 31.625903, lng: -7.989083, precision: "pin", source: "google" } });
  });

  it("flags a viewport-only /@lat,lng link as less precise", () => {
    const result = parseLocationInput("https://www.google.com/maps/@31.6295,-8.0089,15z");
    expect(result.ok && result.location.precision).toBe("viewport");
  });

  it("reads q=lat,lng, ll= and destination= as pins", () => {
    expect(parseLocationInput("https://maps.google.com/?q=31.6295,-8.0089")).toMatchObject({ ok: true, location: { lat: 31.6295, lng: -8.0089, precision: "pin" } });
    expect(parseLocationInput("https://www.google.com/maps?q=31.6295%2C-8.0089")).toMatchObject({ ok: true, location: { lat: 31.6295 } });
    expect(parseLocationInput("https://www.google.com/maps/dir/?api=1&destination=31.6295,-8.0089")).toMatchObject({ ok: true, location: { precision: "pin" } });
  });

  it("does not guess from a name-only search link", () => {
    expect(parseLocationInput("https://www.google.com/maps/search/?api=1&query=Jemaa+el+Fnaa")).toEqual({ ok: false, reason: "no_coordinates" });
    expect(parseLocationInput("https://www.google.com/maps/place/Jemaa+el-Fnaa")).toEqual({ ok: false, reason: "no_coordinates" });
  });

  it("reads OpenStreetMap links", () => {
    expect(parseLocationInput("https://www.openstreetmap.org/?mlat=31.6295&mlon=-8.0089#map=17/31.6295/-8.0089")).toMatchObject({
      ok: true,
      location: { precision: "pin", source: "osm" },
    });
    expect(parseLocationInput("https://www.openstreetmap.org/#map=16/31.6295/-8.0089")).toMatchObject({ ok: true, location: { precision: "viewport" } });
    expect(parseLocationInput("https://www.openstreetmap.org/node/123456")).toEqual({ ok: false, reason: "no_coordinates" });
  });

  it("accepts typed pairs and geo: URIs", () => {
    expect(parseLocationInput("31.6295, -8.0089")).toMatchObject({ ok: true, location: { lat: 31.6295, lng: -8.0089, source: "typed" } });
    expect(parseLocationInput("31.6295 -8.0089")).toMatchObject({ ok: true });
    expect(parseLocationInput("geo:31.6295,-8.0089")).toMatchObject({ ok: true, location: { source: "geo" } });
  });

  it("rejects out-of-range, null-island, empty and non-map input", () => {
    expect(parseLocationInput("95.1, 10")).toEqual({ ok: false, reason: "out_of_range" });
    expect(parseLocationInput("10, 190.5")).toEqual({ ok: false, reason: "out_of_range" });
    expect(parseLocationInput("0, 0")).toEqual({ ok: false, reason: "null_island" });
    expect(parseLocationInput("   ")).toEqual({ ok: false, reason: "empty" });
    expect(parseLocationInput("https://evil.example.com/maps/@31.6,-8.0,15z")).toEqual({ ok: false, reason: "unsupported_url" });
    expect(parseLocationInput("javascript:alert(1)")).toEqual({ ok: false, reason: "unsupported_url" });
    expect(parseLocationInput("ftp://www.google.com/maps/@1,2,3z")).toEqual({ ok: false, reason: "unsupported_url" });
    expect(parseLocationInput("https://www.google.com/search?q=31.6,-8.0")).toEqual({ ok: false, reason: "unsupported_url" });
  });

  it("asks for resolution of short links instead of fetching them", () => {
    expect(isGoogleShortLink("https://maps.app.goo.gl/AbC123")).toBe(true);
    expect(isGoogleShortLink("https://goo.gl/maps/AbC123")).toBe(true);
    expect(isGoogleShortLink("https://goo.gl/other")).toBe(false);
    expect(parseLocationInput("https://maps.app.goo.gl/AbC123")).toEqual({ ok: false, reason: "short_link" });
  });

  it("limits stored map links to known maps hosts", () => {
    expect(isKnownMapHost("https://www.google.com/maps/@1,2,3z")).toBe(true);
    expect(isKnownMapHost("https://maps.app.goo.gl/x")).toBe(true);
    expect(isKnownMapHost("https://www.openstreetmap.org/")).toBe(true);
    expect(isKnownMapHost("https://evil.example.com/")).toBe(false);
    expect(isKnownMapHost("javascript:alert(1)")).toBe(false);
    expect(isKnownMapHost("https://user:pw@www.google.com/maps")).toBe(false);
  });

  it("rounds to six decimals (about 0.1 m)", () => {
    const result = parseLocationInput("31.62590312345, -7.98908312345");
    expect(result.ok && result.location).toMatchObject({ lat: 31.625903, lng: -7.989083 });
  });
});

describe("short link expansion", () => {
  function fakeFetch(hops: Record<string, string>): typeof fetch {
    return (async (input: RequestInfo | URL) => {
      const target = hops[String(input)];
      if (!target) return new Response(null, { status: 404 });
      return new Response(null, { status: 302, headers: { location: target } });
    }) as typeof fetch;
  }

  it("follows Google redirects to the long maps URL", async () => {
    const fetchImpl = fakeFetch({ "https://maps.app.goo.gl/AbC": "https://www.google.com/maps/place/X/@31.6,-8.0,17z/data=!3d31.61!4d-8.01" });
    expect(await resolveGoogleShortLink("https://maps.app.goo.gl/AbC", fetchImpl)).toContain("!3d31.61!4d-8.01");
  });

  it("refuses to follow a redirect off Google", async () => {
    const fetchImpl = fakeFetch({ "https://maps.app.goo.gl/AbC": "https://evil.example.com/steal" });
    expect(await resolveGoogleShortLink("https://maps.app.goo.gl/AbC", fetchImpl)).toBeNull();
  });

  it("gives up when nothing redirects", async () => {
    expect(await resolveGoogleShortLink("https://maps.app.goo.gl/AbC", fakeFetch({}))).toBeNull();
  });
});

describe("URL safety", () => {
  it("recognises private and reserved addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "fe80::1", "fd00::1", "::ffff:10.0.0.1"]) {
      expect(isPrivateOrReservedIp(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111"]) {
      expect(isPrivateOrReservedIp(ip), ip).toBe(false);
    }
  });

  it("accepts ordinary public https URLs and rejects dangerous ones", () => {
    expect(checkPublicHttpUrl("https://example.com/hotel").ok).toBe(true);
    expect(checkPublicHttpUrl("http://example.com/hotel").ok).toBe(true);
    expect(checkPublicHttpUrl("http://example.com/hotel", { httpsOnly: true })).toEqual({ ok: false, reason: "protocol" });
    expect(checkPublicHttpUrl("javascript:alert(1)")).toEqual({ ok: false, reason: "protocol" });
    expect(checkPublicHttpUrl("data:text/html,<script>")).toEqual({ ok: false, reason: "protocol" });
    expect(checkPublicHttpUrl("https://user:pw@example.com/")).toEqual({ ok: false, reason: "credentials" });
    expect(checkPublicHttpUrl("https://localhost/x")).toEqual({ ok: false, reason: "host" });
    expect(checkPublicHttpUrl("https://intranet/x")).toEqual({ ok: false, reason: "host" });
    expect(checkPublicHttpUrl("https://192.168.0.1/x")).toEqual({ ok: false, reason: "host" });
    expect(checkPublicHttpUrl("https://[::1]/x")).toEqual({ ok: false, reason: "host" });
    expect(checkPublicHttpUrl("https://example.com/" + "a".repeat(600))).toEqual({ ok: false, reason: "too_long" });
    expect(checkPublicHttpUrl("not a url")).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("place input rules", () => {
  const base = { name: "Café Les Épices", city: "Marrakech", country: "Morocco", lat: 31.6295, lng: -7.9811 };

  it("creates drafts by default and trims text", () => {
    const parsed = placeCreateSchema.parse({ ...base, name: "  Café Les Épices  ", description: "   " });
    expect(parsed.status).toBe("pending");
    expect(parsed.name).toBe("Café Les Épices");
    expect(parsed.description).toBeNull();
  });

  it("requires real coordinates and rejects (0, 0)", () => {
    expect(placeCreateSchema.safeParse({ ...base, lat: 0, lng: 0 }).success).toBe(false);
    expect(placeCreateSchema.safeParse({ ...base, lat: 91 }).success).toBe(false);
    expect(placeCreateSchema.safeParse({ ...base, lng: undefined }).success).toBe(false);
    expect(placeCreateSchema.safeParse({ ...base, lat: Number.NaN }).success).toBe(false);
  });

  it("does not allow setting trust or ownership fields", () => {
    expect(placeCreateSchema.safeParse({ ...base, sourceType: "seed" }).success).toBe(false);
    expect(placeCreateSchema.safeParse({ ...base, ratingAverage: 5 }).success).toBe(false);
    expect(placeUpdateSchema.safeParse({ createdByUserId: "x" }).success).toBe(false);
  });

  it("only lets drafts be created as pending or approved, not archived", () => {
    expect(placeCreateSchema.safeParse({ ...base, status: "rejected" }).success).toBe(false);
  });

  it("accepts a status-only update (the moderation buttons) and rejects an empty one", () => {
    expect(placeUpdateSchema.safeParse({ status: "approved" }).success).toBe(true);
    expect(placeUpdateSchema.safeParse({ status: "rejected" }).success).toBe(true);
    expect(placeUpdateSchema.safeParse({}).success).toBe(false);
    expect(placeUpdateSchema.safeParse({ status: "bogus" }).success).toBe(false);
  });

  it("allows clearing optional fields with null", () => {
    const parsed = placeUpdateSchema.parse({ coverImageUrl: null, address: "", categoryId: null });
    expect(parsed.coverImageUrl).toBeNull();
    expect(parsed.address).toBeNull();
    expect(parsed.categoryId).toBeNull();
  });

  it("lists what blocks publishing", () => {
    expect(publishBlockers({ ...base, categoryId: "c" })).toEqual([]);
    expect(publishBlockers(base)).toEqual(["category"]);
    expect(publishBlockers({ ...base, categoryId: "c", lat: 0, lng: 0 })).toEqual(["coordinates"]);
    expect(publishBlockers({ name: "", city: "", country: "" })).toEqual(["name", "city", "country", "category", "coordinates"]);
  });

  it("tells our own stored images from pasted external ones", () => {
    const env = { UPLOADS_PUBLIC_BASE_URL: "https://app.example.com/media/" };
    expect(isInternalCoverUrl("/uploads/place/1/a.jpg", env)).toBe(true);
    expect(isInternalCoverUrl("/media/place/1/a.jpg", env)).toBe(true);
    expect(isInternalCoverUrl("https://app.example.com/media/place/1/a.jpg", env)).toBe(true);
    expect(isInternalCoverUrl("https://app.example.com/media/../secret", env)).toBe(false);
    expect(isInternalCoverUrl("https://cdn.example.org/a.jpg", env)).toBe(false);
    expect(isInternalCoverUrl("/uploads/../etc/passwd", env)).toBe(false);
  });
});

describe("remote image verification", () => {
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);

  function deps(options: { addresses?: string[]; respond: (url: string) => Response }): RemoteImageDeps {
    return {
      lookup: async () => (options.addresses ?? ["93.184.216.34"]).map((address) => ({ address })),
      fetchImpl: (async (input: RequestInfo | URL) => options.respond(String(input))) as typeof fetch,
    };
  }
  const png = (type = "image/png") => new Response(PNG, { status: 200, headers: { "content-type": type } });

  it("accepts a real PNG from a public host", async () => {
    const result = await verifyRemoteImage("https://cdn.example.com/a.png", deps({ respond: () => png() }));
    expect(result).toEqual({ ok: true, contentType: "image/png", bytes: PNG.length });
  });

  it("refuses hosts that resolve to private addresses", async () => {
    const result = await verifyRemoteImage("https://cdn.example.com/a.png", deps({ addresses: ["169.254.169.254"], respond: () => png() }));
    expect(result).toEqual({ ok: false, reason: "blocked_host" });
  });

  it("refuses non-https, odd ports and IP literals", async () => {
    const d = deps({ respond: () => png() });
    expect((await verifyRemoteImage("http://cdn.example.com/a.png", d)).ok).toBe(false);
    expect(await verifyRemoteImage("https://cdn.example.com:8443/a.png", d)).toEqual({ ok: false, reason: "blocked_host" });
    expect(await verifyRemoteImage("https://127.0.0.1/a.png", d)).toEqual({ ok: false, reason: "blocked_host" });
  });

  it("refuses non-images and mismatched content", async () => {
    expect(await verifyRemoteImage("https://cdn.example.com/a", deps({ respond: () => new Response("<html>", { headers: { "content-type": "text/html" } }) }))).toEqual({ ok: false, reason: "not_image" });
    expect(await verifyRemoteImage("https://cdn.example.com/a.png", deps({ respond: () => new Response("not a png", { headers: { "content-type": "image/png" } }) }))).toEqual({ ok: false, reason: "bad_signature" });
    expect(await verifyRemoteImage("https://cdn.example.com/a.svg", deps({ respond: () => new Response("<svg/>", { headers: { "content-type": "image/svg+xml" } }) }))).toEqual({ ok: false, reason: "not_image" });
  });

  it("refuses oversized images", async () => {
    const big = new Response(Buffer.alloc(6 * 1024 * 1024), { headers: { "content-type": "image/png" } });
    expect(await verifyRemoteImage("https://cdn.example.com/a.png", deps({ respond: () => big }))).toEqual({ ok: false, reason: "too_large" });
  });

  it("re-checks every redirect hop and caps the chain", async () => {
    const toPrivate = deps({
      respond: (url) => (url.includes("cdn.example.com") ? new Response(null, { status: 302, headers: { location: "https://127.0.0.1/x.png" } }) : png()),
    });
    expect(await verifyRemoteImage("https://cdn.example.com/a.png", toPrivate)).toEqual({ ok: false, reason: "blocked_host" });

    const loop = deps({ respond: () => new Response(null, { status: 302, headers: { location: "https://cdn.example.com/again.png" } }) });
    expect(await verifyRemoteImage("https://cdn.example.com/a.png", loop)).toEqual({ ok: false, reason: "too_many_redirects" });

    const ok = deps({ respond: (url) => (url.endsWith("/a.png") ? new Response(null, { status: 301, headers: { location: "/b.png" } }) : png()) });
    expect((await verifyRemoteImage("https://cdn.example.com/a.png", ok)).ok).toBe(true);
  });

  it("reports an unreachable host", async () => {
    const down = { lookup: async () => [{ address: "93.184.216.34" }], fetchImpl: (async () => { throw new Error("boom"); }) as typeof fetch };
    expect(await verifyRemoteImage("https://cdn.example.com/a.png", down)).toEqual({ ok: false, reason: "unreachable" });
    expect(await verifyRemoteImage("https://cdn.example.com/a.png", deps({ respond: () => new Response("", { status: 404 }) }))).toEqual({ ok: false, reason: "unreachable" });
  });
});
