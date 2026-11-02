import "server-only";
import { isAllowedShortLinkTarget, isGoogleShortLink } from "@/lib/places/map-link";

// Expands a Google Maps short link (maps.app.goo.gl/...) to the long URL it
// redirects to, so its coordinates can be read. Only Google hosts are ever
// contacted: a short link that redirects anywhere else is refused, so this can
// not be used to make the server fetch arbitrary URLs.

const MAX_HOPS = 4;
const TIMEOUT_MS = 5000;

export async function resolveGoogleShortLink(
  shortUrl: string,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
): Promise<string | null> {
  let current = shortUrl.trim();

  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    let url: URL;
    try {
      url = new URL(current);
    } catch {
      return null;
    }
    if (url.protocol !== "https:" || !isAllowedShortLinkTarget(url.hostname)) return null;
    // Once we are on a long Google Maps URL there is nothing left to expand.
    if (!isGoogleShortLink(current) && hop > 0) return current;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetchImpl(url.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "MySindbad/1.0 (admin map link check)" },
      });
      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        current = new URL(location, url).toString();
        continue;
      }
      return null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  return null;
}
