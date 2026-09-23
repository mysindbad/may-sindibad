import "server-only";
import { and, count, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { communityPostComments, communityPostLikes, communityPosts, media, places, trips, users } from "@/db/schema";
import type { FeedPost } from "@/components/community/PostCard";

export interface LatestCommunityPost {
  id: string;
  kind: string;
  title: string | null;
  body: string;
  authorName: string;
  imageUrl: string | null;
}

/** One published post for a home page preview - the full feed lives at
 * /community. Excludes "story" the same way the feed itself does: those rows
 * are ephemeral and only ever shown through the story tray, so a preview
 * that linked to /community for one would land the traveller on a feed that
 * has no trace of it. */
export async function getLatestCommunityPost(): Promise<LatestCommunityPost | null> {
  const [row] = await db
    .select({
      id: communityPosts.id,
      kind: communityPosts.kind,
      title: communityPosts.title,
      body: communityPosts.body,
      authorName: users.name,
    })
    .from(communityPosts)
    .innerJoin(users, eq(communityPosts.userId, users.id))
    .where(and(eq(communityPosts.status, "published"), ne(communityPosts.kind, "story")))
    .orderBy(desc(communityPosts.createdAt))
    .limit(1);
  if (!row) return null;

  const [image] = await db
    .select({ url: media.url })
    .from(media)
    .where(and(eq(media.ownerType, "community_post"), eq(media.ownerId, row.id)))
    .orderBy(desc(media.createdAt))
    .limit(1);

  return { ...row, imageUrl: image?.url ?? null };
}

/** A single published, non-story post for the /community/[id] permalink a
 * share link points at - same shape the feed itself returns, so it renders
 * through the exact same <PostCard>. */
export async function getCommunityPostById(id: string, viewerId: string | null): Promise<FeedPost | null> {
  const [row] = await db
    .select({
      id: communityPosts.id,
      kind: communityPosts.kind,
      title: communityPosts.title,
      body: communityPosts.body,
      city: communityPosts.city,
      country: communityPosts.country,
      createdAt: communityPosts.createdAt,
      authorId: communityPosts.userId,
      authorName: users.name,
      authorAvatarUrl: users.avatarUrl,
      placeId: communityPosts.placeId,
      placeName: places.name,
      placeCity: places.city,
      placeCountry: places.country,
      placeStatus: places.status,
      tripTitle: trips.title,
      tripDestinationCity: trips.destinationCity,
      tripDestinationCountry: trips.destinationCountry,
      tripStartDate: trips.startDate,
      tripEndDate: trips.endDate,
      tripId: communityPosts.tripId,
    })
    .from(communityPosts)
    .innerJoin(users, eq(communityPosts.userId, users.id))
    .leftJoin(places, eq(communityPosts.placeId, places.id))
    .leftJoin(trips, eq(communityPosts.tripId, trips.id))
    .where(and(eq(communityPosts.id, id), eq(communityPosts.status, "published"), ne(communityPosts.kind, "story")))
    .limit(1);
  if (!row) return null;

  const [[image], [likeRow], [commentRow], likedRow] = await Promise.all([
    db
      .select({ url: media.url })
      .from(media)
      .where(and(eq(media.ownerType, "community_post"), eq(media.ownerId, row.id)))
      .orderBy(desc(media.createdAt))
      .limit(1),
    db.select({ value: count() }).from(communityPostLikes).where(eq(communityPostLikes.postId, row.id)),
    db.select({ value: count() }).from(communityPostComments).where(eq(communityPostComments.postId, row.id)),
    viewerId
      ? db
          .select({ postId: communityPostLikes.postId })
          .from(communityPostLikes)
          .where(and(eq(communityPostLikes.postId, row.id), eq(communityPostLikes.userId, viewerId)))
          .limit(1)
      : Promise.resolve([]),
  ]);

  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    city: row.city,
    country: row.country,
    createdAt: row.createdAt.toISOString(),
    authorName: row.authorName,
    authorAvatarUrl: row.authorAvatarUrl,
    isMine: viewerId === row.authorId,
    imageUrl: image?.url ?? null,
    likeCount: likeRow?.value ?? 0,
    likedByMe: likedRow.length > 0,
    commentCount: commentRow?.value ?? 0,
    place:
      row.placeId && row.placeStatus === "approved"
        ? { id: row.placeId, name: row.placeName ?? "", city: row.placeCity ?? "", country: row.placeCountry ?? "" }
        : null,
    trip: row.tripId
      ? {
          title: row.tripTitle ?? "",
          destinationCity: row.tripDestinationCity ?? "",
          destinationCountry: row.tripDestinationCountry ?? "",
          startDate: row.tripStartDate ?? "",
          endDate: row.tripEndDate ?? "",
        }
      : null,
  };
}
