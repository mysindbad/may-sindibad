import "server-only";
import { and, eq, gt, lt, desc, ilike } from "drizzle-orm";
import { db } from "@/db";
import { places } from "@/db/schema";

export async function getRecommendedPlaces(city?: string, limit = 6) {
  const conditions = [eq(places.status, "approved"), gt(places.ratingCount, 20)];
  if (city) conditions.push(ilike(places.city, `%${city}%`));
  return db.select().from(places).where(and(...conditions)).orderBy(desc(places.ratingAverage)).limit(limit);
}

export async function getHiddenGems(city?: string, limit = 6) {
  const conditions = [eq(places.status, "approved"), lt(places.ratingCount, 40)];
  if (city) conditions.push(ilike(places.city, `%${city}%`));
  return db.select().from(places).where(and(...conditions)).orderBy(desc(places.ratingAverage)).limit(limit);
}

export async function getPlacesByCity(city: string, limit = 12, country?: string) {
  const conditions = [eq(places.status, "approved"), ilike(places.city, city)];
  if (country) conditions.push(ilike(places.country, country));
  return db
    .select()
    .from(places)
    .where(and(...conditions))
    .orderBy(desc(places.ratingAverage))
    .limit(limit);
}
