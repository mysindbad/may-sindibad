import "server-only";
import { and, desc, eq } from "drizzle-orm";
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

/** One published post for a home page preview - the full feed lives at /community. */
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
    .where(eq(communityPosts.status, "published"))
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
