import { NextResponse } from "next/server";
import { db } from "@/db";
import { places } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { isAdminRequiredError, isUnauthenticatedError, jsonError, zodErrorResponse } from "@/lib/api-utils";
import { isTrustedMutationRequest } from "@/lib/security/mutation-origin";
import { parseJsonBodyWithLimit } from "@/lib/http/bounded-body";
import { checkRateLimit, clientKeyFromRequest } from "@/lib/rate-limit";
import { placeCreateSchema, publishBlockers } from "@/lib/places/place-input";
import { categoryExists, checkCoverImage, findNearDuplicate } from "@/lib/places/admin-service";
import { round6 } from "@/lib/places/map-link";

export const dynamic = "force-dynamic";

// Create a place from the control room. Publishing straight away
// (status "approved") is allowed only when the place is complete; otherwise it
// is saved as a draft ("pending", invisible to travellers). Admin-authored
// places are marked source "verified" and are never created by seed scripts.
export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return jsonError("Request origin is not allowed.", 403);
  try {
    const admin = await requireAdmin();

    const rate = await checkRateLimit(clientKeyFromRequest(request, "admin-place-create:" + admin.id), 60, 60 * 60 * 1000);
    if (!rate.allowed) return jsonError("Too many place changes. Please slow down.", 429);

    const json = await parseJsonBodyWithLimit(request);
    if (!json.ok) return jsonError("Request body is too large.", 413);
    const parsed = placeCreateSchema.safeParse(json.body);
    if (!parsed.success) return zodErrorResponse(parsed.error);
    const input = parsed.data;

    if (input.status === "approved") {
      const blockers = publishBlockers(input);
      if (blockers.length > 0) return jsonError("The place is not complete enough to publish.", 422, { code: "incomplete", blockers });
    }

    if (input.categoryId && !(await categoryExists(input.categoryId))) {
      return jsonError("Unknown category.", 422, { code: "unknown_category" });
    }

    if (input.coverImageUrl) {
      const cover = await checkCoverImage(input.coverImageUrl);
      if (!cover.ok) return jsonError("The cover image could not be verified.", 422, { code: "bad_cover_image", reason: cover.reason });
    }

    if (!input.allowDuplicate) {
      const duplicate = await findNearDuplicate({ name: input.name, city: input.city, lat: input.lat, lng: input.lng });
      if (duplicate) return jsonError("A place with this name already exists at this location.", 409, { code: "duplicate", duplicate });
    }

    const [place] = await db
      .insert(places)
      .values({
        name: input.name,
        description: input.description ?? null,
        categoryId: input.categoryId ?? null,
        city: input.city,
        country: input.country,
        address: input.address ?? null,
        lat: round6(input.lat),
        lng: round6(input.lng),
        priceLevel: input.priceLevel ?? 0,
        coverImageUrl: input.coverImageUrl ?? null,
        sourceType: "verified",
        status: input.status,
        createdByUserId: admin.id,
      })
      .returning();

    return NextResponse.json({ place }, { status: 201 });
  } catch (error) {
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    if (isAdminRequiredError(error)) return jsonError("Administrator access is required.", 403);
    throw error;
  }
}
