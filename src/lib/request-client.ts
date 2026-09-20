import { isIP } from "node:net";

/**
 * Extract a syntactically valid client IP from reverse-proxy headers.
 * Deployment must still ensure its trusted proxy overwrites these headers;
 * this helper prevents malformed/oversized values from entering the DB or
 * becoming unbounded rate-limit keys.
 */
export function clientIpFromRequest(request: Request): string | null {
  const candidates = [
    request.headers.get("x-real-ip"),
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  ];
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value && value.length <= 64 && isIP(value) !== 0) return value;
  }
  return null;
}
