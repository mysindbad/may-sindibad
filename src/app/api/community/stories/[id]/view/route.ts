import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { communityPosts, communityStoryViews } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { isUnauthenticatedError, jsonError } from "@/lib/api-utils";
import { isTrustedMutationRequest } from "@/lib/security/mutation-origin";

// A story only ever records a view from someone other than its own author -
// the count that matters to a traveller is who else saw it, not themselves.
// The unique (post, user) constraint makes a repeated call harmless, so
// there is nothing here worth rate-limiting beyond that.

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isTrustedMutationRequest(request)) return jsonError("Request origin is not allowed.", 403);
  try {
    const user = await requireUser();
    const { id } = await context.params;

    const [post] = await db.select({ userId: communityPosts.userId }).from(communityPosts).where(eq(communityPosts.id, id)).limit(1);
    if (!post) return jsonError("Story not found.", 404);
    if (post.userId === user.id) return NextResponse.json({ recorded: false });

    await db.insert(communityStoryViews).values({ postId: id, userId: user.id }).onConflictDoNothing();
    return NextResponse.json({ recorded: true });
  } catch (error) {
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    throw error;
  }
}
