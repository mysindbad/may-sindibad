import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { communityPosts, places, users } from "@/db/schema";
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
      city: communityPosts.city,
      country: communityPosts.country,
      createdAt: communityPosts.createdAt,
      authorId: communityPosts.userId,
      authorName: users.name,
      placeName: places.name,
      placeCity: places.city,
      placeCountry: places.country,
      placeStatus: places.status,
    })
    .from(communityPosts)
    .innerJoin(users, eq(communityPosts.userId, users.id))
    .leftJoin(places, eq(communityPosts.placeId, places.id))
    .where(eq(communityPosts.status, "published"))
    .orderBy(desc(communityPosts.createdAt))
    .limit(50);

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
      // A place is only offered onward if it is still publicly approved, so a
      // post cannot become a back door to a withdrawn place.
      place:
        row.placeId && row.placeStatus === "approved"
          ? { id: row.placeId, name: row.placeName, city: row.placeCity, country: row.placeCountry }
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

    const [post] = await db
      .insert(communityPosts)
      .values({ userId: user.id, kind: parsed.data.kind, body: parsed.data.body, placeId, city, country })
      .returning({ id: communityPosts.id, createdAt: communityPosts.createdAt });

    return NextResponse.json({ post: { id: post.id, createdAt: post.createdAt } }, { status: 201 });
  } catch (error) {
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    throw error;
  }
}
