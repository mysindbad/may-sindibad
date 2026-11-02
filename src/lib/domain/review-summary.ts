// Pure helpers that turn untrusted contribution payloads and moderation
// targets into short, safe display values for the control room. Everything is
// plain text (React escapes it) and length-bounded: a report or contribution
// is user-written content, so nothing here echoes it unbounded.

export function excerpt(value: unknown, max = 160): string | null {
  if (typeof value !== "string") return null;
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (!collapsed) return null;
  return collapsed.length > max ? collapsed.slice(0, max - 1).trimEnd() + "…" : collapsed;
}

export interface PayloadField {
  key: string;
  value: string;
}

const KNOWN_KEYS = ["name", "city", "country", "address", "description"] as const;
const MAX_EXTRA_FIELDS = 4;

/**
 * The contribution's own fields in a stable order: the ones we understand
 * first, then at most a few extra simple text/number entries. Nested objects
 * and long blobs are never dumped on screen.
 */
export function contributionFields(payload: unknown): PayloadField[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const record = payload as Record<string, unknown>;
  const fields: PayloadField[] = [];

  for (const key of KNOWN_KEYS) {
    const text = excerpt(record[key], key === "description" ? 600 : 200);
    if (text) fields.push({ key, value: text });
  }

  const skip = new Set<string>([...KNOWN_KEYS, "lat", "lng"]);
  let extras = 0;
  for (const [key, raw] of Object.entries(record)) {
    if (skip.has(key) || extras >= MAX_EXTRA_FIELDS) continue;
    if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
      const text = excerpt(String(raw), 200);
      if (text) {
        fields.push({ key: key.slice(0, 40), value: text });
        extras += 1;
      }
    }
  }
  return fields;
}

export function contributionCoordinates(payload: unknown): { lat: number; lng: number } | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const { lat, lng } = payload as { lat?: unknown; lng?: unknown };
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

export function osmViewUrl(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`;
}

export type ReportTargetType = "place" | "provider" | "review" | "contribution" | "user" | "community_post";

/** Where in the control room an admin can act on this kind of target. */
export function adminHrefFor(type: string, id: string): string | null {
  switch (type) {
    case "place":
      return `/control-room/places/${id}`;
    case "provider":
      return "/control-room/providers";
    case "review":
      return "/control-room/reviews";
    case "community_post":
      return "/control-room/community";
    case "user":
      return "/control-room/users";
    case "contribution":
      return "/control-room/contributions";
    default:
      return null;
  }
}
