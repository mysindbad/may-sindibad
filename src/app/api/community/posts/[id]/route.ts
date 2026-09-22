import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { communityPosts } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { isUnauthenticatedError, jsonError } from "@/lib/api-utils";
import { isTrustedMutationRequest } from "@/lib/security/mutation-origin";

// Removing a post. The author can always take their own words down, and a
// moderator can take down anyone's. A moderator removal is a status change
// rather than a delete so the row remains available to the report it came
// from; the author's own delete removes the row outright.

export const dynamic = "force-dynamic";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isTrustedMutationRequest(request)) return jsonError("Request origin is not allowed.", 403);
  try {
    const user = await requireUser();
    const { id } = await context.params;

    const [post] = await db
      .select({ id: communityPosts.id, userId: communityPosts.userId })
      .from(communityPosts)
      .where(eq(communityPosts.id, id))
      .limit(1);
    if (!post) return jsonError("Post not found.", 404);

    const isAuthor = post.userId === user.id;
    const isModerator = user.role === "admin";
    if (!isAuthor && !isModerator) return jsonError("You can only remove your own posts.", 403);

    if (isAuthor) {
      await db.delete(communityPosts).where(eq(communityPosts.id, id));
      return NextResponse.json({ removed: id });
    }

    await db.update(communityPosts).set({ status: "removed" }).where(eq(communityPosts.id, id));
    return NextResponse.json({ removed: id, moderated: true });
  } catch (error) {
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    throw error;
  }
}
