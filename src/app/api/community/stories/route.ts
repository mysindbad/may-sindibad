import { NextResponse } from "next/server";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import { communityPostLikes, communityPosts, media, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";

// Stories, not the regular feed: a story is only ever active for 24h from
// posting, exactly like Facebook/Instagram. There is no cron job and no
// deletion - "expiry" is just this query-time cutoff, so a story quietly
// stops being returned once it ages out instead of needing cleanup.

export const dynamic = "force-dynamic";

const STORY_LIFETIME_MS = 24 * 60 * 60 * 1000;

export async function GET() {
  const activeSince = new Date(Date.now() - STORY_LIFETIME_MS);

  const rows = await db
    .select({
      id: communityPosts.id,
      title: communityPosts.title,
      body: communityPosts.body,
      createdAt: communityPosts.createdAt,
      authorId: communityPosts.userId,
      authorName: users.name,
      authorAvatarUrl: users.avatarUrl,
    })
    .from(communityPosts)
    .innerJoin(users, eq(communityPosts.userId, users.id))
    .where(and(eq(communityPosts.kind, "story"), eq(communityPosts.status, "published"), gte(communityPosts.createdAt, activeSince)))
    .orderBy(asc(communityPosts.createdAt));

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

  // Like counts and the viewer's own like, batched the same way the regular
  // feed does it - one extra query for every story on the tray rather than
  // one per story.
  const likeCountByPost = new Map<string, number>();
  const likedByMe = new Set<string>();
  if (postIds.length > 0) {
    const likeRows = await db
      .select({ postId: communityPostLikes.postId, userId: communityPostLikes.userId })
      .from(communityPostLikes)
      .where(inArray(communityPostLikes.postId, postIds));
    for (const row of likeRows) {
      likeCountByPost.set(row.postId, (likeCountByPost.get(row.postId) ?? 0) + 1);
      if (viewer && row.userId === viewer.id) likedByMe.add(row.postId);
    }
  }

  // Group by author, preserving the oldest-first order within each group
  // (so tapping through one traveller's stories plays in the order they
  // posted them), then order the groups themselves: the viewer's own story
  // first (as every Stories UI does), the rest by most recent activity.
  const groups = new Map<
    string,
    {
      authorId: string;
      authorName: string;
      authorAvatarUrl: string | null;
      isMine: boolean;
      stories: {
        id: string;
        title: string | null;
        body: string;
        imageUrl: string | null;
        createdAt: string;
        expiresAt: string;
        likeCount: number;
        likedByMe: boolean;
      }[];
    }
  >();

  for (const row of rows) {
    let group = groups.get(row.authorId);
    if (!group) {
      group = {
        authorId: row.authorId,
        authorName: row.authorName,
        authorAvatarUrl: row.authorAvatarUrl,
        isMine: viewer ? viewer.id === row.authorId : false,
        stories: [],
      };
      groups.set(row.authorId, group);
    }
    group.stories.push({
      id: row.id,
      title: row.title,
      body: row.body,
      imageUrl: imagesByPost.get(row.id) ?? null,
      createdAt: row.createdAt.toISOString(),
      expiresAt: new Date(row.createdAt.getTime() + STORY_LIFETIME_MS).toISOString(),
      likeCount: likeCountByPost.get(row.id) ?? 0,
      likedByMe: likedByMe.has(row.id),
    });
  }

  const orderedGroups = [...groups.values()].sort((a, b) => {
    if (a.isMine !== b.isMine) return a.isMine ? -1 : 1;
    const aLatest = a.stories[a.stories.length - 1].createdAt;
    const bLatest = b.stories[b.stories.length - 1].createdAt;
    return bLatest.localeCompare(aLatest);
  });

  return NextResponse.json({ groups: orderedGroups });
}
