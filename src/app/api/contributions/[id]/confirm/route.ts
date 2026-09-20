import { NextResponse } from "next/server";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { contributionConfirmations, contributions, reports } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { contributionReadyForReview, evaluateContributionStatus } from "@/lib/domain/community-trust";
import { isUnauthenticatedError, jsonError } from "@/lib/api-utils";
import { isTrustedMutationRequest } from "@/lib/security/mutation-origin";
import { checkRateLimit, clientKeyFromRequest } from "@/lib/rate-limit";
import { toPublicContributionView } from "@/lib/community/client-view";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isTrustedMutationRequest(request)) return jsonError("Request origin is not allowed.", 403);
  try {
    const user = await requireUser();
    const rate = await checkRateLimit(clientKeyFromRequest(request, `confirm:${user.id}`), 50, 60 * 60 * 1000);
    if (!rate.allowed) return jsonError("You're confirming contributions too quickly.", 429);

    const { id } = await context.params;
    const [contribution] = await db.select().from(contributions).where(eq(contributions.id, id)).limit(1);
    if (!contribution) return jsonError("Contribution not found.", 404);
    if (!['pending', 'flagged'].includes(contribution.status)) {
      return jsonError("This contribution is no longer open for confirmations.", 409);
    }
    if (contribution.submittedByUserId === user.id) return jsonError("You can't confirm your own contribution.", 403);

    const result = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(contributionConfirmations)
        .values({ contributionId: id, userId: user.id })
        .onConflictDoNothing({ target: [contributionConfirmations.contributionId, contributionConfirmations.userId] })
        .returning();
      if (inserted.length === 0) return { duplicate: true as const };

      // Atomic increment avoids lost updates when several travellers confirm at once.
      const [current] = await tx
        .update(contributions)
        .set({ confirmationsCount: sql`${contributions.confirmationsCount} + 1` })
        .where(and(eq(contributions.id, id), inArray(contributions.status, ["pending", "flagged"])))
        .returning();
      if (!current) throw new Error("CONTRIBUTION_CLOSED_DURING_CONFIRMATION");

      const [{ value: reportsCount }] = await tx
        .select({ value: count(reports.id) })
        .from(reports)
        .where(and(eq(reports.targetType, "contribution"), eq(reports.targetId, id)));

      const reportTotal = Number(reportsCount);
      const nextStatus = evaluateContributionStatus({
        confirmationsCount: current.confirmationsCount,
        reportsCount: reportTotal,
        currentStatus: current.status,
      });

      let updated = current;
      if (nextStatus !== current.status) {
        const [changed] = await tx
          .update(contributions)
          .set({ status: nextStatus })
          .where(and(eq(contributions.id, id), eq(contributions.status, current.status)))
          .returning();
        if (changed) updated = changed;
      }

      return {
        duplicate: false as const,
        contribution: toPublicContributionView(updated),
        confirmationsCount: updated.confirmationsCount,
        readyForReview: contributionReadyForReview(updated.confirmationsCount, reportTotal),
      };
    });

    if (result.duplicate) return jsonError("You already confirmed this contribution.", 409);
    return NextResponse.json(result);
  } catch (error) {
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    if (error instanceof Error && error.message === "CONTRIBUTION_CLOSED_DURING_CONFIRMATION") {
      return jsonError("This contribution was closed while you were confirming it. Refresh and try again.", 409);
    }
    throw error;
  }
}
