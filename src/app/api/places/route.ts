import { NextResponse } from "next/server";
import { and, desc, eq, gte, ilike, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { places, placeCategories } from "@/db/schema";
import { jsonError } from "@/lib/api-utils";
import { boundingBoxForRadius, haversineKm } from "@/lib/geo/distance";

export const dynamic = "force-dynamic";

function optionalFiniteNumber(value: string | null): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const city = searchParams.get("city")?.trim();
  const categorySlug = searchParams.get("category")?.trim();
  const q = searchParams.get("q")?.trim();
  if ((city?.length ?? 0) > 120 || (categorySlug?.length ?? 0) > 60 || (q?.length ?? 0) > 200) {
    return jsonError("Search parameters are too long.", 400);
  }

  const lat = optionalFiniteNumber(searchParams.get("lat"));
  const lng = optionalFiniteNumber(searchParams.get("lng"));
  const radiusKm = Math.min(Math.max(optionalFiniteNumber(searchParams.get("radiusKm")) ?? 50, 1), 250);
  const requestedLimit = Number(searchParams.get("limit") ?? 30);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 60) : 30;
  const hasCoordinates = lat !== undefined && lng !== undefined && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  // Lets a caller ask for generally popular places with no location filter
  // at all - used when a traveller is nowhere near the seeded coverage, so
  // "nearby" can still fall back to "well regarded" instead of showing
  // nothing.
  const recommended = searchParams.get("recommended") === "true";

  if (!city && !q && !hasCoordinates && !recommended) return jsonError("Provide a city, search query, or coordinates.", 400);

  const conditions = [eq(places.status, "approved")];
  if (city) conditions.push(ilike(places.city, `%${city}%`));
  if (q) {
    const term = `%${q}%`;
    conditions.push(
      or(
        ilike(places.name, term),
        ilike(places.description, term),
        ilike(places.city, term),
        ilike(places.country, term),
      )!,
    );
  }

  if (categorySlug) {
    const [cat] = await db.select({ id: placeCategories.id }).from(placeCategories).where(eq(placeCategories.slug, categorySlug)).limit(1);
    if (!cat) return NextResponse.json({ places: [] });
    conditions.push(eq(places.categoryId, cat.id));
  }

  if (hasCoordinates) {
    // Do not scan an arbitrary first N rows from a global table: once the
    // dataset grows that can miss the actually-nearest places completely.
    // Apply a conservative geographic bounding box in PostgreSQL, then the
    // exact haversine radius below. This remains provider/PostGIS agnostic.
    const box = boundingBoxForRadius({ lat: lat!, lng: lng! }, radiusKm);
    conditions.push(gte(places.lat, box.minLat), lte(places.lat, box.maxLat));
    if (!(box.minLng === -180 && box.maxLng === 180)) {
      conditions.push(
        box.crossesAntimeridian
          ? or(gte(places.lng, box.minLng), lte(places.lng, box.maxLng))!
          : and(gte(places.lng, box.minLng), lte(places.lng, box.maxLng))!,
      );
    }
  }

  const query = db
    .select({
      id: places.id,
      name: places.name,
      description: places.description,
      city: places.city,
      country: places.country,
      lat: places.lat,
      lng: places.lng,
      priceLevel: places.priceLevel,
      coverImageUrl: places.coverImageUrl,
      ratingAverage: places.ratingAverage,
      ratingCount: places.ratingCount,
      sourceType: places.sourceType,
      status: places.status,
      confirmationsCount: places.confirmationsCount,
      category: placeCategories.slug,
    })
    .from(places)
    .leftJoin(placeCategories, eq(places.categoryId, placeCategories.id))
    .where(and(...conditions));

  const rows = hasCoordinates ? await query : await query.orderBy(desc(places.ratingAverage)).limit(limit);
  if (!hasCoordinates) return NextResponse.json({ places: rows });

  const origin = { lat: lat!, lng: lng! };
  const nearby = rows
    .map((place) => ({ ...place, distanceKm: haversineKm(origin, { lat: place.lat, lng: place.lng }) }))
    .filter((place) => place.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);

  return NextResponse.json({ places: nearby, contextCity: nearby[0]?.city ?? null });
}
