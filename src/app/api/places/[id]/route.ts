import { NextResponse } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@/db";
import { places, reviews, users } from "@/db/schema";
import { jsonError } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const [place] = await db
    .select({
      id: places.id,
      name: places.name,
      description: places.description,
      categoryId: places.categoryId,
      city: places.city,
      country: places.country,
      address: places.address,
      lat: places.lat,
      lng: places.lng,
      priceLevel: places.priceLevel,
      coverImageUrl: places.coverImageUrl,
      ratingAverage: places.ratingAverage,
      ratingCount: places.ratingCount,
      sourceType: places.sourceType,
      status: places.status,
      confirmationsCount: places.confirmationsCount,
      providerId: places.providerId,
      createdAt: places.createdAt,
      updatedAt: places.updatedAt,
    })
    .from(places)
    .where(eq(places.id, id))
    .limit(1);
  if (!place || place.status !== "approved") return jsonError("Place not found.", 404);

  const placeReviews = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      comment: reviews.comment,
      createdAt: reviews.createdAt,
      userName: users.name,
    })
    .from(reviews)
    .innerJoin(users, eq(reviews.userId, users.id))
    .where(and(eq(reviews.placeId, id), eq(reviews.status, "published")))
    .orderBy(desc(reviews.createdAt))
    .limit(20);

  return NextResponse.json({ place, reviews: placeReviews });
}
