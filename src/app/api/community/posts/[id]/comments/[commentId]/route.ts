import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { communityPostComments } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { isUnauthenticatedError, jsonError } from "@/lib/api-utils";
import { isTrustedMutationRequest } from "@/lib/security/mutation-origin";

export const dynamic = "force-dynamic";

// The author can always take their own words down, and a moderator can take
// down anyone's - the same rule the post-level DELETE already uses.
export async function DELETE(request: Request, context: { params: Promise<{ id: string; commentId: string }> }) {
  if (!isTrustedMutationRequest(request)) return jsonError("Request origin is not allowed.", 403);
  try {
    const user = await requireUser();
    const { id, commentId } = await context.params;

    const [comment] = await db
      .select({ id: communityPostComments.id, userId: communityPostComments.userId })
      .from(communityPostComments)
      .where(and(eq(communityPostComments.id, commentId), eq(communityPostComments.postId, id)))
      .limit(1);
    if (!comment) return jsonError("Comment not found.", 404);

    const isAuthor = comment.userId === user.id;
    const isModerator = user.role === "admin";
    if (!isAuthor && !isModerator) return jsonError("You can only remove your own comments.", 403);

    await db.delete(communityPostComments).where(eq(communityPostComments.id, commentId));
    return NextResponse.json({ removed: commentId });
  } catch (error) {
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    throw error;
  }
}
