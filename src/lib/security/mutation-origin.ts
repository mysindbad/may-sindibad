import "server-only";
import { getTrustedAppOrigin } from "@/lib/app-origin";

function normalizeOrigin(value: string): string | null {
  if (!value || value === "null") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Browser CSRF boundary for cookie-authenticated state changes.
 *
 * - An explicit Origin must exactly match the canonical application origin.
 * - Cross-site Fetch Metadata is rejected even when Origin is missing.
 * - Same-site-but-cross-origin requests without Origin are rejected so an
 *   untrusted sibling subdomain cannot silently mutate cookie-auth state.
 * - Requests with neither browser header remain possible for trusted native /
 *   server clients; those clients still need normal authentication/authorization.
 */
export function isTrustedMutationRequest(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (fetchSite === "cross-site") return false;

  const suppliedOrigin = request.headers.get("origin");
  if (suppliedOrigin !== null) {
    const normalized = normalizeOrigin(suppliedOrigin);
    if (!normalized) return false;
    const trusted = getTrustedAppOrigin(new URL(request.url).origin);
    return trusted !== null && normalized === trusted;
  }

  // A browser request from a sibling subdomain is "same-site" but not
  // same-origin. Without an Origin value there is no safe exact-origin proof.
  if (fetchSite === "same-site") return false;

  return true;
}
