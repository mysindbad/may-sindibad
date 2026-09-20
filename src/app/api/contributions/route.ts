import { NextResponse } from "next/server";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { contributions, places } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { contributionCreateSchema } from "@/lib/validation";
import { isUnauthenticatedError, jsonError, zodErrorResponse } from "@/lib/api-utils";
import { isTrustedMutationRequest } from "@/lib/security/mutation-origin";
import { parseJsonBodyWithLimit } from "@/lib/http/bounded-body";
import { checkRateLimit, clientKeyFromRequest } from "@/lib/rate-limit";
import { isImplementedContributionType } from "@/lib/domain/community-contributions";
import { toOwnerContributionView, toPublicContributionView } from "@/lib/community/client-view";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const mineOnly = searchParams.get("mine") === "true";

    const rows = mineOnly
      ? await db.select().from(contributions).where(eq(contributions.submittedByUserId, user.id)).orderBy(desc(contributions.createdAt)).limit(100)
      : await db
          .select({
            id: contributions.id,
            type: contributions.type,
            placeId: contributions.placeId,
            payload: contributions.payload,
            status: contributions.status,
            confirmationsCount: contributions.confirmationsCount,
            source: contributions.source,
            createdAt: contributions.createdAt,
          })
          .from(contributions)
          .where(inArray(contributions.status, ["pending", "approved"]))
          .orderBy(desc(contributions.createdAt))
          .limit(50);

    return NextResponse.json({ contributions: mineOnly ? rows.map(toOwnerContributionView) : rows.map(toPublicContributionView) });
  } catch (error) {
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    throw error;
  }
}

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return jsonError("Request origin is not allowed.", 403);
  try {
    const user = await requireUser();
    const rate = await checkRateLimit(clientKeyFromRequest(request, `contrib:${user.id}`), 20, 60 * 60 * 1000);
    if (!rate.allowed) return jsonError("You're contributing too fast. Please slow down.", 429);

    const json = await parseJsonBodyWithLimit(request);
    if (!json.ok) return jsonError("Request body is too large.", 413);
    const body = json.body;
    const parsed = contributionCreateSchema.safeParse(body);
    if (!parsed.success) return zodErrorResponse(parsed.error);
    if (!isImplementedContributionType(parsed.data.type)) {
      return jsonError("This contribution type is not available yet. No change was submitted.", 422);
    }

    if (parsed.data.placeId) {
      const [place] = await db.select({ id: places.id, status: places.status }).from(places).where(eq(places.id, parsed.data.placeId)).limit(1);
      if (!place || place.status !== "approved") return jsonError("Place not found.", 404);
    }

    const [contribution] = await db
      .insert(contributions)
      .values({
        type: parsed.data.type,
        placeId: parsed.data.placeId ?? null,
        payload: parsed.data.payload,
        submittedByUserId: user.id,
        status: "pending",
        source: "community",
      })
      .returning();

    // New community knowledge always starts untrusted — never promoted to
    // global truth from a single submission (see lib/domain/community-trust.ts).
    return NextResponse.json({ contribution: toOwnerContributionView(contribution) }, { status: 201 });
  } catch (error) {
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    throw error;
  }
}
