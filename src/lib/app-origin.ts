import "server-only";

function normalizeHttpOrigin(value: string | undefined, requireHttps: boolean): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (requireHttps && url.protocol !== "https:") return null;
    // Configuration represents the application origin, not an arbitrary path.
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Resolve the public application origin without trusting an attacker-controlled
 * Host header in production. APP_BASE_URL is preferred; AUTH_BASE_URL remains
 * a backwards-compatible alias for existing deployments.
 */
export function getTrustedAppOrigin(requestOrigin?: string): string | null {
  const production = process.env.NODE_ENV === "production";
  const configured =
    normalizeHttpOrigin(process.env.APP_BASE_URL, production) ??
    normalizeHttpOrigin(process.env.AUTH_BASE_URL, production);
  if (configured) return configured;

  // Local development may use the actual dev-server origin. Production must
  // fail closed until a canonical HTTPS origin is explicitly configured.
  if (production) return null;
  return normalizeHttpOrigin(requestOrigin, false);
}

export function hasTrustedProductionOrigin(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return getTrustedAppOrigin() !== null;
}
