import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { contributions, places } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { isAdminRequiredError, isUnauthenticatedError, jsonError, zodErrorResponse } from "@/lib/api-utils";
import { isTrustedMutationRequest } from "@/lib/security/mutation-origin";
import { parseJsonBodyWithLimit } from "@/lib/http/bounded-body";
import { checkRateLimit, clientKeyFromRequest } from "@/lib/rate-limit";
import { contributionCreateSchema } from "@/lib/validation";
import { isImplementedContributionType } from "@/lib/domain/community-contributions";

const bodySchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "flagged"]),
  reviewNote: z.string().trim().max(2000).optional().nullable(),
  coordinates: z
    .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
    .optional(),
});

/** Backend-only moderation primitive. No admin dashboard is created in this phase. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isTrustedMutationRequest(request)) return jsonError("Request origin is not allowed.", 403);
  try {
    const user = await requireAdmin();

    const rate = await checkRateLimit(clientKeyFromRequest(request, `admin-contribution:${user.id}`), 180, 60 * 60 * 1000);
    if (!rate.allowed) return jsonError("Too many moderation changes. Please slow down.", 429);

    const json = await parseJsonBodyWithLimit(request);
    if (!json.ok) return jsonError("Request body is too large.", 413);
    const body = json.body;
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return zodErrorResponse(parsed.error);

    const { id } = await context.params;
    const [existing] = await db.select({ id: contributions.id, type: contributions.type }).from(contributions).where(eq(contributions.id, id)).limit(1);
    if (!existing) return jsonError("Contribution not found.", 404);
    if (parsed.data.status === "approved" && !isImplementedContributionType(existing.type)) {
      return jsonError("This contribution type does not have a complete application workflow yet and cannot be approved.", 409);
    }

    const result = await db.transaction(async (tx) => {
      // Serialize moderation for one contribution. Without a row lock, two
      // concurrent approvals of a new_place can both observe placeId = NULL,
      // create two approved places, and race to attach only one of them.
      await tx.execute(sql`select id from contributions where id = ${id} for update`);
      const [current] = await tx.select().from(contributions).where(eq(contributions.id, id)).limit(1);
      if (!current) return null;

      let placeId = current.placeId;

      if (current.type === "new_place") {
        if (parsed.data.status === "approved" && !placeId) {
          const validated = contributionCreateSchema.safeParse({ type: current.type, placeId: undefined, payload: current.payload });
          if (!validated.success) throw new Error("Stored contribution payload failed validation.");

          const payload = validated.data.payload;
          const submittedLat = typeof payload.lat === "number" ? payload.lat : undefined;
          const submittedLng = typeof payload.lng === "number" ? payload.lng : undefined;
          const coordinates = parsed.data.coordinates ??
            (submittedLat !== undefined && submittedLng !== undefined ? { lat: submittedLat, lng: submittedLng } : undefined);
          if (!coordinates) throw new Error("APPROVAL_COORDINATES_REQUIRED");

          const description = typeof payload.description === "string" ? payload.description.trim().slice(0, 3000) : null;
          const [createdPlace] = await tx
            .insert(places)
            .values({
              name: String(payload.name).trim(),
              description: description || null,
              city: String(payload.city).trim(),
              country: String(payload.country).trim(),
              lat: coordinates.lat,
              lng: coordinates.lng,
              sourceType: "community",
              status: "approved",
              confirmationsCount: current.confirmationsCount,
              createdByUserId: current.submittedByUserId,
            })
            .returning();
          placeId = createdPlace.id;
        } else if (placeId) {
          await tx
            .update(places)
            .set({ status: parsed.data.status, updatedAt: new Date() })
            .where(eq(places.id, placeId));
        }
      }

      const [updated] = await tx
        .update(contributions)
        .set({
          status: parsed.data.status,
          placeId,
          reviewNote: parsed.data.reviewNote ?? null,
          reviewedAt: new Date(),
        })
        .where(eq(contributions.id, id))
        .returning();

      return updated;
    });

    if (!result) return jsonError("Contribution not found.", 404);
    return NextResponse.json({ contribution: result });
  } catch (error) {
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    if (isAdminRequiredError(error)) return jsonError("Administrator access is required.", 403);
    if (error instanceof Error && error.message === "Stored contribution payload failed validation.") {
      return jsonError("Contribution payload is invalid and cannot be approved.", 422);
    }
    if (error instanceof Error && error.message === "APPROVAL_COORDINATES_REQUIRED") {
      return jsonError("Verified coordinates are required before approving a new place.", 422);
    }
    throw error;
  }
}
