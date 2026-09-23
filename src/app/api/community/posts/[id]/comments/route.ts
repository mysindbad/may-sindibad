import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { communityPostComments, communityPosts, users } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { isUnauthenticatedError, jsonError, zodErrorResponse } from "@/lib/api-utils";
import { isTrustedMutationRequest } from "@/lib/security/mutation-origin";
import { parseJsonBodyWithLimit } from "@/lib/http/bounded-body";
import { checkRateLimit, clientKeyFromRequest } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  body: z.string().trim().min(1).max(1000),
});

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const rows = await db
    .select({
      id: communityPostComments.id,
      body: communityPostComments.body,
      createdAt: communityPostComments.createdAt,
      authorId: communityPostComments.userId,
      authorName: users.name,
      authorAvatarUrl: users.avatarUrl,
    })
    .from(communityPostComments)
    .innerJoin(users, eq(communityPostComments.userId, users.id))
    .where(eq(communityPostComments.postId, id))
    .orderBy(asc(communityPostComments.createdAt))
    .limit(200);

  return NextResponse.json({ comments: rows });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isTrustedMutationRequest(request)) return jsonError("Request origin is not allowed.", 403);
  try {
    const user = await requireUser();
    const { id } = await context.params;

    const rate = await checkRateLimit(clientKeyFromRequest(request, "community-comment:" + user.id), 60, 60 * 60 * 1000);
    if (!rate.allowed) return jsonError("You're commenting too fast. Please slow down.", 429);

    const [post] = await db.select({ id: communityPosts.id }).from(communityPosts).where(eq(communityPosts.id, id)).limit(1);
    if (!post) return jsonError("Post not found.", 404);

    const json = await parseJsonBodyWithLimit(request);
    if (!json.ok) return jsonError("Request body is too large.", 413);
    const parsed = createSchema.safeParse(json.body);
    if (!parsed.success) return zodErrorResponse(parsed.error);

    const [comment] = await db
      .insert(communityPostComments)
      .values({ postId: id, userId: user.id, body: parsed.data.body })
      .returning({ id: communityPostComments.id, body: communityPostComments.body, createdAt: communityPostComments.createdAt });

    return NextResponse.json(
      {
        comment: {
          id: comment.id,
          body: comment.body,
          createdAt: comment.createdAt,
          authorId: user.id,
          authorName: user.name,
          authorAvatarUrl: user.avatarUrl,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    throw error;
  }
}
