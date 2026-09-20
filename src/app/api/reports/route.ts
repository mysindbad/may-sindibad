import { NextResponse } from "next/server";
import { db } from "@/db";
import { reports } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { reportCreateSchema } from "@/lib/validation";
import { isUnauthenticatedError, jsonError, zodErrorResponse } from "@/lib/api-utils";
import { isTrustedMutationRequest } from "@/lib/security/mutation-origin";
import { parseJsonBodyWithLimit } from "@/lib/http/bounded-body";
import { checkRateLimit, clientKeyFromRequest } from "@/lib/rate-limit";
import { targetExists } from "@/lib/domain/entity-access";

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return jsonError("Request origin is not allowed.", 403);
  try {
    const user = await requireUser();
    const rate = await checkRateLimit(clientKeyFromRequest(request, `report:${user.id}`), 30, 60 * 60 * 1000);
    if (!rate.allowed) return jsonError("You're reporting too fast. Please slow down.", 429);

    const json = await parseJsonBodyWithLimit(request);
    if (!json.ok) return jsonError("Request body is too large.", 413);
    const body = json.body;
    const parsed = reportCreateSchema.safeParse(body);
    if (!parsed.success) return zodErrorResponse(parsed.error);
    if (!(await targetExists(parsed.data.targetType, parsed.data.targetId))) return jsonError("Report target not found.", 404);

    const [report] = await db
      .insert(reports)
      .values({ ...parsed.data, reportedByUserId: user.id })
      .onConflictDoNothing({ target: [reports.reportedByUserId, reports.targetType, reports.targetId] })
      .returning();

    if (!report) return jsonError("You already reported this item.", 409);
    return NextResponse.json(
      {
        report: {
          id: report.id,
          targetType: report.targetType,
          targetId: report.targetId,
          reason: report.reason,
          details: report.details,
          status: report.status,
          createdAt: report.createdAt,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    throw error;
  }
}
