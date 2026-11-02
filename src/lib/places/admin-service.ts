import "server-only";
import { and, eq, gte, ilike, lte } from "drizzle-orm";
import { db } from "@/db";
import { placeCategories, places } from "@/db/schema";
import { boundingBoxForRadius, haversineKm } from "@/lib/geo/distance";
import { isInternalCoverUrl } from "@/lib/places/place-input";
import { verifyRemoteImage, type RemoteImageFailure } from "@/lib/places/remote-image";

export type CoverCheck = { ok: true } | { ok: false; reason: RemoteImageFailure | "invalid_url" };

/**
 * A cover image is either one we stored ourselves (upload adapter output) or
 * an external https URL that passed verifyRemoteImage. Anything else - a
 * javascript:/data: URI, an http URL, a private host, a non-image - is refused.
 */
export async function checkCoverImage(url: string): Promise<CoverCheck> {
  if (isInternalCoverUrl(url)) return { ok: true };
  const result = await verifyRemoteImage(url);
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}

export async function categoryExists(categoryId: string): Promise<boolean> {
  const [row] = await db.select({ id: placeCategories.id }).from(placeCategories).where(eq(placeCategories.id, categoryId)).limit(1);
  return Boolean(row);
}

const DUPLICATE_RADIUS_KM = 0.3;

/** A place with the same name (case-insensitive) in the same city within ~300 m. */
export async function findNearDuplicate(
  input: { name: string; city: string; lat: number; lng: number },
  excludeId?: string,
): Promise<{ id: string; name: string; status: string } | null> {
  const box = boundingBoxForRadius({ lat: input.lat, lng: input.lng }, DUPLICATE_RADIUS_KM);
  const rows = await db
    .select({ id: places.id, name: places.name, status: places.status, lat: places.lat, lng: places.lng })
    .from(places)
    .where(
      and(
        ilike(places.name, input.name.replace(/[%_\\]/g, "\\$&")),
        ilike(places.city, input.city.replace(/[%_\\]/g, "\\$&")),
        gte(places.lat, box.minLat),
        lte(places.lat, box.maxLat),
      ),
    )
    .limit(20);
  const match = rows.find(
    (row) => row.id !== excludeId && haversineKm({ lat: input.lat, lng: input.lng }, { lat: row.lat, lng: row.lng }) <= DUPLICATE_RADIUS_KM,
  );
  return match ? { id: match.id, name: match.name, status: match.status } : null;
}
