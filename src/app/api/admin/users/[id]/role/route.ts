import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { isAdminRequiredError, isUnauthenticatedError, jsonError, zodErrorResponse } from "@/lib/api-utils";
import { isTrustedMutationRequest } from "@/lib/security/mutation-origin";
import { parseJsonBodyWithLimit } from "@/lib/http/bounded-body";
import { checkRateLimit, clientKeyFromRequest } from "@/lib/rate-limit";

const bodySchema = z.object({
  role: z.enum(["traveler", "provider", "admin"]),
});

// Deliberately narrow and rate-limited: this is the one endpoint that can
// grant or remove admin access itself, so it gets a tighter limit than the
// other moderation actions and an explicit block on an admin changing their
// own role - the one mistake here that a confirmation dialog can't undo,
// since a lone admin who demotes themselves has no one left to fix it.
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isTrustedMutationRequest(request)) return jsonError("Request origin is not allowed.", 403);
  try {
    const admin = await requireAdmin();

    const rate = await checkRateLimit(clientKeyFromRequest(request, "admin-user-role:" + admin.id), 30, 60 * 60 * 1000);
    if (!rate.allowed) return jsonError("Too many role changes. Please slow down.", 429);

    const json = await parseJsonBodyWithLimit(request);
    if (!json.ok) return jsonError("Request body is too large.", 413);
    const parsed = bodySchema.safeParse(json.body);
    if (!parsed.success) return zodErrorResponse(parsed.error);

    const { id } = await context.params;
    if (id === admin.id) return jsonError("You cannot change your own role.", 409);

    const [user] = await db.update(users).set({ role: parsed.data.role, updatedAt: new Date() }).where(eq(users.id, id)).returning();
    if (!user) return jsonError("User not found.", 404);

    return NextResponse.json({ user: { id: user.id, role: user.role } });
  } catch (error) {
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    if (isAdminRequiredError(error)) return jsonError("Administrator access is required.", 403);
    throw error;
  }
}
