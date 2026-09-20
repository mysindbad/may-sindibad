import { NextResponse } from "next/server";
import { and, avg, count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { places, providers, reviews } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { reviewCreateSchema } from "@/lib/validation";
import { isUnauthenticatedError, jsonError, zodErrorResponse } from "@/lib/api-utils";
import { isTrustedMutationRequest } from "@/lib/security/mutation-origin";
import { parseJsonBodyWithLimit } from "@/lib/http/bounded-body";
import { checkRateLimit, clientKeyFromRequest } from "@/lib/rate-limit";

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return jsonError("Request origin is not allowed.", 403);
  try {
    const user = await requireUser();
    const rate = await checkRateLimit(clientKeyFromRequest(request, `review:${user.id}`), 20, 60 * 60 * 1000);
    if (!rate.allowed) return jsonError("You're reviewing too fast. Please slow down.", 429);

    const json = await parseJsonBodyWithLimit(request);
    if (!json.ok) return jsonError("Request body is too large.", 413);
    const body = json.body;
    const parsed = reviewCreateSchema.safeParse(body);
    if (!parsed.success) return zodErrorResponse(parsed.error);

    const { placeId, providerId, rating, comment } = parsed.data;

    if (placeId) {
      const [place] = await db
        .select({ id: places.id, status: places.status, providerId: places.providerId })
        .from(places)
        .where(eq(places.id, placeId))
        .limit(1);
      if (!place || place.status !== "approved") return jsonError("Place not found.", 404);

      // A provider-owned place must not be self-rated by the same account.
      // Otherwise a business owner can manufacture trust/ranking through the
      // traveler review surface even though the review row looks legitimate.
      if (place.providerId) {
        const [ownedProvider] = await db
          .select({ id: providers.id })
          .from(providers)
          .where(and(eq(providers.id, place.providerId), eq(providers.ownerUserId, user.id)))
          .limit(1);
        if (ownedProvider) return jsonError("You can't review your own business.", 403);
      }
    }
    if (providerId) {
      const [provider] = await db
        .select({
          id: providers.id,
          ownerUserId: providers.ownerUserId,
          isActive: providers.isActive,
          verificationStatus: providers.verificationStatus,
        })
        .from(providers)
        .where(eq(providers.id, providerId))
        .limit(1);
      if (!provider || !provider.isActive || provider.verificationStatus !== "verified") return jsonError("Provider not found.", 404);
      if (provider.ownerUserId === user.id) return jsonError("You can't review your own business.", 403);
    }

    const duplicate = placeId
      ? await db.select({ id: reviews.id }).from(reviews).where(and(eq(reviews.userId, user.id), eq(reviews.placeId, placeId))).limit(1)
      : await db.select({ id: reviews.id }).from(reviews).where(and(eq(reviews.userId, user.id), eq(reviews.providerId, providerId!))).limit(1);
    if (duplicate.length > 0) return jsonError("You already reviewed this.", 409);

    let review: typeof reviews.$inferSelect | undefined;

    if (placeId) {
      review = await db.transaction(async (tx) => {
        // Serialize rating aggregation per place. Without this lock, two first
        // reviews submitted at the same time can both calculate a count of 1
        // and leave a stale cached aggregate even though two rows exist.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${placeId}))`);

        const [inserted] = await tx
          .insert(reviews)
          .values({ placeId, providerId: null, userId: user.id, rating, comment })
          .onConflictDoNothing()
          .returning();
        if (!inserted) return undefined;

        const [agg] = await tx
          .select({ average: avg(reviews.rating), total: count(reviews.id) })
          .from(reviews)
          .where(and(eq(reviews.placeId, placeId), eq(reviews.status, "published")));
        await tx
          .update(places)
          .set({ ratingAverage: Number(agg.average ?? 0), ratingCount: Number(agg.total ?? 0), updatedAt: new Date() })
          .where(eq(places.id, placeId));

        return inserted;
      });
    } else {
      [review] = await db
        .insert(reviews)
        .values({ placeId: null, providerId: providerId!, userId: user.id, rating, comment })
        .onConflictDoNothing()
        .returning();
    }

    if (!review) return jsonError("You already reviewed this.", 409);
    return NextResponse.json(
      {
        review: {
          id: review.id,
          placeId: review.placeId,
          providerId: review.providerId,
          rating: review.rating,
          comment: review.comment,
          status: review.status,
          createdAt: review.createdAt,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    throw error;
  }
}
