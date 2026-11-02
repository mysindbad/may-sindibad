// Pure URL / address safety checks shared by the admin place API and its
// tests. Nothing here performs network I/O.

/** True when an IPv4/IPv6 address is not a public internet address. */
export function isPrivateOrReservedIp(address: string): boolean {
  const ip = address.trim().toLowerCase();

  // IPv4-mapped IPv6 (::ffff:10.0.0.1) - judge the embedded IPv4.
  const mapped = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return isPrivateOrReservedIp(mapped[1]);

  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if ([a, b, Number(v4[3]), Number(v4[4])].some((n) => n > 255)) return true;
    if (a === 0 || a === 10 || a === 127) return true; // this-network, private, loopback
    if (a === 169 && b === 254) return true; // link-local, cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
    if (a === 192 && b === 0 && Number(v4[3]) === 0) return true; // IETF protocol assignments
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
    if (a >= 224) return true; // multicast, reserved, broadcast
    return false;
  }

  if (ip.includes(":")) {
    if (ip === "::" || ip === "::1") return true;
    if (/^f[cd]/.test(ip)) return true; // unique local fc00::/7
    if (/^fe[89ab]/.test(ip)) return true; // link-local fe80::/10
    if (/^ff/.test(ip)) return true; // multicast
    if (ip.startsWith("2001:db8")) return true; // documentation
    return false;
  }

  // Not an IP literal at all: caller should treat as a hostname.
  return false;
}

export function isIpLiteral(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "");
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(":");
}

export type UrlProblem = "invalid" | "protocol" | "credentials" | "too_long" | "host";

export type UrlCheck = { ok: true; url: string } | { ok: false; reason: UrlProblem };

const MAX_URL_LENGTH = 500;

/**
 * A URL that is safe to STORE and render as a link or <img>: http(s) only, no
 * embedded credentials, no private hosts / IP literals. (Fetching adds a DNS
 * check on top; see remote-image.ts.)
 */
export function checkPublicHttpUrl(raw: string, options: { httpsOnly?: boolean } = {}): UrlCheck {
  const value = raw.trim();
  if (value.length > MAX_URL_LENGTH) return { ok: false, reason: "too_long" };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && !options.httpsOnly)) return { ok: false, reason: "protocol" };
  if (url.username || url.password) return { ok: false, reason: "credentials" };

  const host = url.hostname.toLowerCase();
  if (!host.includes(".") && !isIpLiteral(host)) return { ok: false, reason: "host" }; // "localhost", intranet names
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return { ok: false, reason: "host" };
  }
  if (isIpLiteral(host) && isPrivateOrReservedIp(host.replace(/^\[|\]$/g, ""))) return { ok: false, reason: "host" };
  return { ok: true, url: url.toString() };
}
