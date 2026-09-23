import "server-only";
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { communityPosts, media, users } from "@/db/schema";

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
