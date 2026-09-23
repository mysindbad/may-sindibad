import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { places } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { isAdminRequiredError, isUnauthenticatedError, jsonError, zodErrorResponse } from "@/lib/api-utils";
import { isTrustedMutationRequest } from "@/lib/security/mutation-origin";
import { parseJsonBodyWithLimit } from "@/lib/http/bounded-body";
import { checkRateLimit, clientKeyFromRequest } from "@/lib/rate-limit";

const bodySchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "flagged"]),
});

// A direct moderation action on a place itself, independent of the
// contribution-approval path - a place can also need re-review after it
// already exists (a report, a stale listing), not only at creation time.
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isTrustedMutationRequest(request)) return jsonError("Request origin is not allowed.", 403);
  try {
    const admin = await requireAdmin();

    const rate = await checkRateLimit(clientKeyFromRequest(request, "admin-place:" + admin.id), 180, 60 * 60 * 1000);
    if (!rate.allowed) return jsonError("Too many moderation changes. Please slow down.", 429);

    const json = await parseJsonBodyWithLimit(request);
    if (!json.ok) return jsonError("Request body is too large.", 413);
    const parsed = bodySchema.safeParse(json.body);
    if (!parsed.success) return zodErrorResponse(parsed.error);

    const { id } = await context.params;
    const [place] = await db.update(places).set({ status: parsed.data.status, updatedAt: new Date() }).where(eq(places.id, id)).returning();
    if (!place) return jsonError("Place not found.", 404);

    return NextResponse.json({ place });
  } catch (error) {
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    if (isAdminRequiredError(error)) return jsonError("Administrator access is required.", 403);
    throw error;
  }
}
