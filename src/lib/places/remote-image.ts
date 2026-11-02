import "server-only";
import { lookup as dnsLookup } from "node:dns/promises";
import { ResponseBodyTooLargeError, readResponseBodyWithLimit } from "@/lib/http/bounded-body";
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES, validateImageSignature } from "@/lib/storage";
import { checkPublicHttpUrl, isIpLiteral, isPrivateOrReservedIp } from "@/lib/places/url-safety";

// Verifies an admin-pasted cover image URL before it is stored: it must be
// https, point at a PUBLIC host, answer with a real JPEG/PNG/WEBP no larger
// than the upload limit, and the bytes must match the declared type. Only
// admins can reach this (the routes call requireAdmin), but a server-side
// fetch of a user-supplied URL is still an SSRF primitive, so private and
// link-local addresses are refused at every redirect hop.
//
// Residual risk (documented, accepted for an admin-only, rate-limited route):
// DNS can change between this lookup and the fetch's own lookup (rebinding).

export type RemoteImageFailure =
  | "invalid_url"
  | "blocked_host"
  | "unreachable"
  | "too_many_redirects"
  | "not_image"
  | "too_large"
  | "bad_signature";

export type RemoteImageResult = { ok: true; contentType: string; bytes: number } | { ok: false; reason: RemoteImageFailure };

export interface RemoteImageDeps {
  lookup: (hostname: string) => Promise<Array<{ address: string }>>;
  fetchImpl: typeof fetch;
}

const defaultDeps: RemoteImageDeps = {
  lookup: (hostname) => dnsLookup(hostname, { all: true }),
  fetchImpl: (input, init) => fetch(input, init),
};

const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 8000;

async function hostIsPublic(hostname: string, deps: RemoteImageDeps): Promise<boolean> {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (isIpLiteral(host)) return !isPrivateOrReservedIp(host);
  try {
    const addresses = await deps.lookup(host);
    return addresses.length > 0 && addresses.every((entry) => !isPrivateOrReservedIp(entry.address));
  } catch {
    return false;
  }
}

export async function verifyRemoteImage(rawUrl: string, deps: RemoteImageDeps = defaultDeps): Promise<RemoteImageResult> {
  let current = rawUrl.trim();

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const checked = checkPublicHttpUrl(current, { httpsOnly: true });
    if (!checked.ok) return { ok: false, reason: checked.reason === "host" ? "blocked_host" : "invalid_url" };

    const url = new URL(checked.url);
    if (url.port && url.port !== "443") return { ok: false, reason: "blocked_host" };
    if (!(await hostIsPublic(url.hostname, deps))) return { ok: false, reason: "blocked_host" };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await deps.fetchImpl(url.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { Accept: "image/jpeg,image/png,image/webp", "User-Agent": "MySindbad/1.0 (admin image check)" },
      });
    } catch {
      return { ok: false, reason: "unreachable" };
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { ok: false, reason: "unreachable" };
      try {
        current = new URL(location, url).toString();
      } catch {
        return { ok: false, reason: "invalid_url" };
      }
      continue;
    }

    if (!response.ok) return { ok: false, reason: "unreachable" };

    const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_IMAGE_TYPES.has(contentType)) return { ok: false, reason: "not_image" };

    let body: Uint8Array;
    try {
      body = await readResponseBodyWithLimit(response, MAX_UPLOAD_BYTES);
    } catch (error) {
      if (error instanceof ResponseBodyTooLargeError) return { ok: false, reason: "too_large" };
      return { ok: false, reason: "unreachable" };
    }
    if (body.byteLength === 0) return { ok: false, reason: "not_image" };

    const signatureError = validateImageSignature(Buffer.from(body), contentType);
    if (signatureError) return { ok: false, reason: "bad_signature" };

    return { ok: true, contentType, bytes: body.byteLength };
  }

  return { ok: false, reason: "too_many_redirects" };
}
