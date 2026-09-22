import { NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { communityPosts, media, places, trips, users } from "@/db/schema";
import { getCurrentUser, requireUser } from "@/lib/auth/session";
import { isUnauthenticatedError, jsonError, zodErrorResponse } from "@/lib/api-utils";
import { isTrustedMutationRequest } from "@/lib/security/mutation-origin";
import { parseJsonBodyWithLimit } from "@/lib/http/bounded-body";
import { checkRateLimit, clientKeyFromRequest } from "@/lib/rate-limit";

// The community feed. A post is worth publishing only if another traveller can
// do something with it, so a post that names a place carries that place's id
// and the reader can drop it into their own trip from the feed.

export const dynamic = "force-dynamic";

const createSchema = z.object({
  kind: z.enum(["moment", "tip", "place"]).default("moment"),
  body: z.string().trim().min(2).max(1000),
  placeId: z.string().uuid().optional(),
  tripId: z.string().uuid().optional(),
  city: z.string().trim().max(120).optional(),
  country: z.string().trim().max(120).optional(),
});

export async function GET() {
  // Only published posts are ever served. Flagged or removed posts stay
  // invisible to everyone except moderation queries.
  const rows = await db
    .select({
      id: communityPosts.id,
      kind: communityPosts.kind,
      body: communityPosts.body,
      placeId: communityPosts.placeId,
      tripId: communityPosts.tripId,
      city: communityPosts.city,
      country: communityPosts.country,
      createdAt: communityPosts.createdAt,
      authorId: communityPosts.userId,
      authorName: users.name,
      placeName: places.name,
      placeCity: places.city,
      placeCountry: places.country,
      placeStatus: places.status,
      tripTitle: trips.title,
      tripDestinationCity: trips.destinationCity,
      tripDestinationCountry: trips.destinationCountry,
      tripStartDate: trips.startDate,
      tripEndDate: trips.endDate,
    })
    .from(communityPosts)
    .innerJoin(users, eq(communityPosts.userId, users.id))
    .leftJoin(places, eq(communityPosts.placeId, places.id))
    .leftJoin(trips, eq(communityPosts.tripId, trips.id))
    .where(eq(communityPosts.status, "published"))
    .orderBy(desc(communityPosts.createdAt))
    .limit(50);

  // Photos are attached separately through the shared media table (the same
  // one a place cover photo or provider gallery uses), so this is a second,
  // batched lookup rather than a join that would fan out one row per photo.
  const postIds = rows.map((row) => row.id);
  const imagesByPost = new Map<string, string>();
  if (postIds.length > 0) {
    const imageRows = await db
      .select({ ownerId: media.ownerId, url: media.url })
      .from(media)
      .where(and(eq(media.ownerType, "community_post"), inArray(media.ownerId, postIds)))
      .orderBy(media.createdAt);
    for (const row of imageRows) {
      if (!imagesByPost.has(row.ownerId)) imagesByPost.set(row.ownerId, row.url);
    }
  }

  const viewer = await getCurrentUser();

  return NextResponse.json({
    posts: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      body: row.body,
      city: row.city,
      country: row.country,
      createdAt: row.createdAt,
      authorName: row.authorName,
      isMine: viewer ? viewer.id === row.authorId : false,
      imageUrl: imagesByPost.get(row.id) ?? null,
      // A place is only offered onward if it is still publicly approved, so a
      // post cannot become a back door to a withdrawn place.
      place:
        row.placeId && row.placeStatus === "approved"
          ? { id: row.placeId, name: row.placeName, city: row.placeCity, country: row.placeCountry }
          : null,
      // The linked trip may since have been deleted (ON DELETE SET NULL), in
      // which case tripId is gone too and this is simply omitted.
      trip: row.tripId
        ? {
            title: row.tripTitle,
            destinationCity: row.tripDestinationCity,
            destinationCountry: row.tripDestinationCountry,
            startDate: row.tripStartDate,
            endDate: row.tripEndDate,
          }
        : null,
    })),
  });
}

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return jsonError("Request origin is not allowed.", 403);
  try {
    const user = await requireUser();
    const rate = await checkRateLimit(clientKeyFromRequest(request, "community-post:" + user.id), 20, 60 * 60 * 1000);
    if (!rate.allowed) return jsonError("You're posting too fast. Please slow down.", 429);

    const json = await parseJsonBodyWithLimit(request);
    if (!json.ok) return jsonError("Request body is too large.", 413);
    const parsed = createSchema.safeParse(json.body);
    if (!parsed.success) return zodErrorResponse(parsed.error);

    let placeId: string | null = null;
    let city = parsed.data.city ?? null;
    let country = parsed.data.country ?? null;

    if (parsed.data.placeId) {
      const [place] = await db
        .select({ id: places.id, city: places.city, country: places.country })
        .from(places)
        .where(and(eq(places.id, parsed.data.placeId), eq(places.status, "approved")))
        .limit(1);
      if (!place) return jsonError("That place is not available.", 422);
      placeId = place.id;
      // Location comes from the place record rather than from free text, so a
      // post cannot claim a place sits in a city it does not.
      city = place.city;
      country = place.country;
    }

    let tripId: string | null = null;
    if (parsed.data.tripId) {
      // Only the traveller's own trip can be showcased - never someone else's.
      const [trip] = await db
        .select({ id: trips.id })
        .from(trips)
        .where(and(eq(trips.id, parsed.data.tripId), eq(trips.userId, user.id)))
        .limit(1);
      if (!trip) return jsonError("That trip is not available.", 422);
      tripId = trip.id;
    }

    const [post] = await db
      .insert(communityPosts)
      .values({ userId: user.id, kind: parsed.data.kind, body: parsed.data.body, placeId, tripId, city, country })
      .returning({ id: communityPosts.id, createdAt: communityPosts.createdAt });

    return NextResponse.json({ post: { id: post.id, createdAt: post.createdAt } }, { status: 201 });
  } catch (error) {
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    throw error;
  }
}
