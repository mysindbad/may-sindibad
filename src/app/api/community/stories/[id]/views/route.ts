import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { communityPostLikes, communityPosts, communityStoryViews, users } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { isUnauthenticatedError, jsonError } from "@/lib/api-utils";

// Who watched your story is only ever visible to you - the same privacy
// Instagram/Facebook Stories use, never surfaced to other viewers.

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;

    const [post] = await db.select({ userId: communityPosts.userId }).from(communityPosts).where(eq(communityPosts.id, id)).limit(1);
    if (!post) return jsonError("Story not found.", 404);
    if (post.userId !== user.id) return jsonError("You can only see views on your own story.", 403);

    const rows = await db
      .select({ name: users.name, avatarUrl: users.avatarUrl, viewedAt: communityStoryViews.viewedAt, likedAt: communityPostLikes.createdAt })
      .from(communityStoryViews)
      .innerJoin(users, eq(communityStoryViews.userId, users.id))
      .leftJoin(communityPostLikes, and(eq(communityPostLikes.postId, id), eq(communityPostLikes.userId, communityStoryViews.userId)))
      .where(eq(communityStoryViews.postId, id))
      .orderBy(desc(communityStoryViews.viewedAt));

    return NextResponse.json({
      count: rows.length,
      viewers: rows.map((row) => ({ name: row.name, avatarUrl: row.avatarUrl, liked: row.likedAt !== null })),
    });
  } catch (error) {
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    throw error;
  }
}
