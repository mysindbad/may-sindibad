import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { reports } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { isUnauthenticatedError, jsonError, zodErrorResponse } from "@/lib/api-utils";
import { isTrustedMutationRequest } from "@/lib/security/mutation-origin";
import { parseJsonBodyWithLimit } from "@/lib/http/bounded-body";
import { checkRateLimit, clientKeyFromRequest } from "@/lib/rate-limit";

const bodySchema = z.object({
  status: z.enum(["open", "reviewed", "dismissed", "actioned"]),
});

/** Backend-only moderation primitive, same shape as admin/providers/[id]/verification. */
export async function PATCH(request, context) {
  if (!isTrustedMutationRequest(request)) return jsonError("Request origin is not allowed.", 403);
  try {
    const user = await requireUser();
    if (user.role !== "admin") return jsonError("Administrator access is required.", 403);

    const rate = await checkRateLimit(clientKeyFromRequest(request, "admin-report:" + user.id), 120, 60 * 60 * 1000);
    if (!rate.allowed) return jsonError("Too many moderation changes. Please slow down.", 429);

    const json = await parseJsonBodyWithLimit(request);
    if (!json.ok) return jsonError("Request body is too large.", 413);
    const parsed = bodySchema.safeParse(json.body);
    if (!parsed.success) return zodErrorResponse(parsed.error);

    const { id } = await context.params;
    const [report] = await db.update(reports).set({ status: parsed.data.status }).where(eq(reports.id, id)).returning();

    if (!report) return jsonError("Report not found.", 404);
    return NextResponse.json({ report });
  } catch (error) {
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    throw error;
  }
}
