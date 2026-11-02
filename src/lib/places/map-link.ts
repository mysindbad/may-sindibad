// Turns what an admin pastes (a Google Maps / OpenStreetMap link, a geo: URI or
// plain "lat, lng") into coordinates - WITHOUT any geocoding service. Nothing
// here guesses: if a link has no coordinates in it (e.g. a bare place-name
// search) the result is an explicit failure, never a looked-up approximation.

export type LocationPrecision =
  /** The coordinates are the place pin itself (Google !3d!4d, q=lat,lng, OSM mlat/mlon, typed pair). */
  | "pin"
  /** The coordinates are only the map viewport centre (Google /@lat,lng,zoom or OSM #map=); the pin may be elsewhere. */
  | "viewport";

export interface ParsedLocation {
  lat: number;
  lng: number;
  precision: LocationPrecision;
  source: "typed" | "google" | "osm" | "geo";
}

export type LocationParseFailure =
  | "empty"
  | "unsupported_url"
  | "no_coordinates"
  | "out_of_range"
  | "null_island"
  | "short_link";

export type LocationParseResult = { ok: true; location: ParsedLocation } | { ok: false; reason: LocationParseFailure };

const NUMBER = String.raw`-?\d{1,3}(?:\.\d+)?`;
const PAIR = new RegExp(`^\\s*(${NUMBER})\\s*[,;\\s]\\s*(${NUMBER})\\s*$`);

/** Hosts whose links we know how to read. */
const GOOGLE_HOST = /^(?:www\.|maps\.)?google\.[a-z.]{2,6}$/i;
const GOOGLE_SHORT_HOSTS = new Set(["maps.app.goo.gl", "goo.gl"]);
const OSM_HOSTS = new Set(["openstreetmap.org", "www.openstreetmap.org", "osm.org", "www.osm.org"]);

export function isGoogleShortLink(input: string): boolean {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const host = url.hostname.toLowerCase();
    if (host === "maps.app.goo.gl") return true;
    return host === "goo.gl" && url.pathname.toLowerCase().startsWith("/maps");
  } catch {
    return false;
  }
}

export function isAllowedShortLinkTarget(host: string): boolean {
  const h = host.toLowerCase();
  return GOOGLE_HOST.test(h) || GOOGLE_SHORT_HOSTS.has(h);
}

function finish(lat: number, lng: number, precision: LocationPrecision, source: ParsedLocation["source"]): LocationParseResult {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, reason: "no_coordinates" };
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return { ok: false, reason: "out_of_range" };
  // (0, 0) is "Null Island": the classic sign of a missing value, never a real venue.
  if (lat === 0 && lng === 0) return { ok: false, reason: "null_island" };
  return { ok: true, location: { lat: round6(lat), lng: round6(lng), precision, source } };
}

export function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function pairFrom(match: RegExpMatchArray | null): [number, number] | null {
  if (!match) return null;
  return [Number(match[1]), Number(match[2])];
}

function parseGoogleUrl(url: URL): LocationParseResult {
  const full = decodeURIComponent(url.pathname + url.search + url.hash).replace(/\+/g, " ");

  // !3d<lat>!4d<lng> inside the data= blob is the place's own pin.
  const pin = pairFrom(full.match(new RegExp(`!3d(${NUMBER})!4d(${NUMBER})`)));
  if (pin) return finish(pin[0], pin[1], "pin", "google");

  // ?q=lat,lng / ?query=lat,lng / ?ll=lat,lng / ?destination=lat,lng / ?daddr=
  for (const key of ["q", "query", "ll", "destination", "daddr", "center"]) {
    const value = url.searchParams.get(key);
    if (!value) continue;
    const typed = pairFrom(value.trim().match(PAIR));
    if (typed) return finish(typed[0], typed[1], key === "center" ? "viewport" : "pin", "google");
  }

  // /@lat,lng,zoom is where the map is CENTRED, not necessarily where the pin is.
  const viewport = pairFrom(full.match(new RegExp(`/@(${NUMBER}),(${NUMBER})(?:,|/|$)`)));
  if (viewport) return finish(viewport[0], viewport[1], "viewport", "google");

  return { ok: false, reason: "no_coordinates" };
}

function parseOsmUrl(url: URL): LocationParseResult {
  const mlat = url.searchParams.get("mlat");
  const mlon = url.searchParams.get("mlon");
  if (mlat !== null && mlon !== null) return finish(Number(mlat), Number(mlon), "pin", "osm");

  // #map=<zoom>/<lat>/<lon> is the viewport centre.
  const viewport = url.hash.match(new RegExp(`map=\\d{1,2}(?:\\.\\d+)?/(${NUMBER})/(${NUMBER})`));
  if (viewport) return finish(Number(viewport[1]), Number(viewport[2]), "viewport", "osm");

  return { ok: false, reason: "no_coordinates" };
}

export function parseLocationInput(raw: string): LocationParseResult {
  const input = raw.trim();
  if (!input) return { ok: false, reason: "empty" };
  if (input.length > 2000) return { ok: false, reason: "unsupported_url" };

  const typed = pairFrom(input.match(PAIR));
  if (typed) return finish(typed[0], typed[1], "pin", "typed");

  const geo = pairFrom(input.match(new RegExp(`^geo:(${NUMBER}),(${NUMBER})`, "i")));
  if (geo) return finish(geo[0], geo[1], "pin", "geo");

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, reason: "no_coordinates" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, reason: "unsupported_url" };

  const host = url.hostname.toLowerCase();
  if (isGoogleShortLink(input)) return { ok: false, reason: "short_link" };
  if (GOOGLE_HOST.test(host)) {
    // Only the maps part of Google; a google.com search page has nothing to read.
    if (!url.pathname.toLowerCase().startsWith("/maps") && host.split(".")[0] !== "maps") return { ok: false, reason: "unsupported_url" };
    return parseGoogleUrl(url);
  }
  if (OSM_HOSTS.has(host)) return parseOsmUrl(url);
  return { ok: false, reason: "unsupported_url" };
}

/**
 * A map link worth storing/opening: http(s) to a known maps host. Used to
 * decide whether an admin-supplied "map link" may be kept at all.
 */
export function isKnownMapHost(input: string): boolean {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    if (url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    return GOOGLE_HOST.test(host) || GOOGLE_SHORT_HOSTS.has(host) || OSM_HOSTS.has(host);
  } catch {
    return false;
  }
}
