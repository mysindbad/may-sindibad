import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { places, reviews, users } from "@/db/schema";
import { PlaceDetail } from "@/components/explore/PlaceDetail";

export const dynamic = "force-dynamic";

export default async function PlaceDetailPage({ params }: { params: Promise<{ placeId: string }> }) {
  const { placeId } = await params;

  const [place] = await db.select().from(places).where(eq(places.id, placeId)).limit(1);
  if (!place || place.status !== "approved") notFound();

  const placeReviews = await db
    .select({ id: reviews.id, rating: reviews.rating, comment: reviews.comment, createdAt: reviews.createdAt, userName: users.name })
    .from(reviews)
    .innerJoin(users, eq(reviews.userId, users.id))
    .where(and(eq(reviews.placeId, placeId), eq(reviews.status, "published")))
    .orderBy(desc(reviews.createdAt))
    .limit(20);

  return (
    <PlaceDetail
      place={{
        id: place.id,
        name: place.name,
        description: place.description,
        city: place.city,
        country: place.country,
        address: place.address,
        lat: place.lat,
        lng: place.lng,
        priceLevel: place.priceLevel,
        ratingAverage: place.ratingAverage,
        ratingCount: place.ratingCount,
        sourceType: place.sourceType,
      }}
      reviews={placeReviews.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))}
    />
  );
}
