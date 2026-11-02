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
import { placeUpdateSchema, publishBlockers } from "@/lib/places/place-input";
import { categoryExists, checkCoverImage } from "@/lib/places/admin-service";
import { round6 } from "@/lib/places/map-link";

// Update a place from the control room: a pure moderation change
// ({ status } only, as sent by the list buttons) or a full edit from the place
// editor. Statuses map to: pending = draft, approved = published,
// rejected = archived (kept, hidden), flagged = under review.
//
// There is deliberately no DELETE: archiving is the safe removal, and it keeps
// reviews, favourites and itinerary items that point at the place intact.
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isTrustedMutationRequest(request)) return jsonError("Request origin is not allowed.", 403);
  try {
    const admin = await requireAdmin();

    const rate = await checkRateLimit(clientKeyFromRequest(request, "admin-place:" + admin.id), 180, 60 * 60 * 1000);
    if (!rate.allowed) return jsonError("Too many moderation changes. Please slow down.", 429);

    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) return jsonError("Place not found.", 404);

    const json = await parseJsonBodyWithLimit(request);
    if (!json.ok) return jsonError("Request body is too large.", 413);
    const parsed = placeUpdateSchema.safeParse(json.body);
    if (!parsed.success) return zodErrorResponse(parsed.error);
    const input = parsed.data;

    const [current] = await db.select().from(places).where(eq(places.id, id)).limit(1);
    if (!current) return jsonError("Place not found.", 404);

    const next = {
      name: input.name ?? current.name,
      city: input.city ?? current.city,
      country: input.country ?? current.country,
      categoryId: input.categoryId !== undefined ? input.categoryId : current.categoryId,
      lat: input.lat ?? current.lat,
      lng: input.lng ?? current.lng,
    };
    const status = input.status ?? current.status;

    if (status === "approved") {
      // The one-click Approve button sends { status } only and must keep
      // working for community submissions that have no category; the editor
      // (any other field present) must produce a complete place.
      const isEditorSave = Object.keys(input).some((key) => key !== "status");
      const blockers = publishBlockers(next).filter((blocker) => isEditorSave || blocker !== "category");
      if (blockers.length > 0) return jsonError("The place is not complete enough to publish.", 422, { code: "incomplete", blockers });
    }

    if (input.categoryId && !(await categoryExists(input.categoryId))) {
      return jsonError("Unknown category.", 422, { code: "unknown_category" });
    }

    if (input.coverImageUrl && input.coverImageUrl !== current.coverImageUrl) {
      const cover = await checkCoverImage(input.coverImageUrl);
      if (!cover.ok) return jsonError("The cover image could not be verified.", 422, { code: "bad_cover_image", reason: cover.reason });
    }

    const [place] = await db
      .update(places)
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
        ...(input.city !== undefined && { city: input.city }),
        ...(input.country !== undefined && { country: input.country }),
        ...(input.address !== undefined && { address: input.address }),
        ...(input.lat !== undefined && { lat: round6(input.lat) }),
        ...(input.lng !== undefined && { lng: round6(input.lng) }),
        ...(input.priceLevel !== undefined && { priceLevel: input.priceLevel }),
        ...(input.coverImageUrl !== undefined && { coverImageUrl: input.coverImageUrl }),
        ...(input.status !== undefined && { status: input.status }),
        updatedAt: new Date(),
      })
      .where(eq(places.id, id))
      .returning();
    if (!place) return jsonError("Place not found.", 404);

    return NextResponse.json({ place });
  } catch (error) {
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    if (isAdminRequiredError(error)) return jsonError("Administrator access is required.", 403);
    throw error;
  }
}
