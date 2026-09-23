import { NextResponse } from "next/server";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { communityPostLikes, communityPosts } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { isUnauthenticatedError, jsonError } from "@/lib/api-utils";
import { isTrustedMutationRequest } from "@/lib/security/mutation-origin";

// A like is a simple, bounded reaction: a unique (post, user) constraint
// means repeating the same request is always safe, so there is nothing here
// worth rate-limiting beyond that.

export const dynamic = "force-dynamic";

async function likeCount(postId: string): Promise<number> {
  const [row] = await db.select({ value: count() }).from(communityPostLikes).where(eq(communityPostLikes.postId, postId));
  return row?.value ?? 0;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isTrustedMutationRequest(request)) return jsonError("Request origin is not allowed.", 403);
  try {
    const user = await requireUser();
    const { id } = await context.params;

    const [post] = await db.select({ id: communityPosts.id }).from(communityPosts).where(eq(communityPosts.id, id)).limit(1);
    if (!post) return jsonError("Post not found.", 404);

    await db.insert(communityPostLikes).values({ postId: id, userId: user.id }).onConflictDoNothing();

    return NextResponse.json({ liked: true, likeCount: await likeCount(id) });
  } catch (error) {
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    throw error;
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isTrustedMutationRequest(request)) return jsonError("Request origin is not allowed.", 403);
  try {
    const user = await requireUser();
    const { id } = await context.params;

    await db.delete(communityPostLikes).where(and(eq(communityPostLikes.postId, id), eq(communityPostLikes.userId, user.id)));

    return NextResponse.json({ liked: false, likeCount: await likeCount(id) });
  } catch (error) {
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    throw error;
  }
}
