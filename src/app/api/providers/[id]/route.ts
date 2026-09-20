import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { providers, providerServices, placeCategories } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { providerUpdateSchema } from "@/lib/validation";
import { isUnauthenticatedError, jsonError, zodErrorResponse } from "@/lib/api-utils";
import { isTrustedMutationRequest } from "@/lib/security/mutation-origin";
import { parseJsonBodyWithLimit } from "@/lib/http/bounded-body";
import { hasCompleteCoordinatePair } from "@/lib/domain/coordinates";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const [provider] = await db
    .select({
      id: providers.id,
      name: providers.name,
      categoryId: providers.categoryId,
      description: providers.description,
      city: providers.city,
      country: providers.country,
      address: providers.address,
      lat: providers.lat,
      lng: providers.lng,
      phone: providers.phone,
      email: providers.email,
      website: providers.website,
      coverImageUrl: providers.coverImageUrl,
      verificationStatus: providers.verificationStatus,
      isActive: providers.isActive,
      createdAt: providers.createdAt,
      updatedAt: providers.updatedAt,
    })
    .from(providers)
    .where(and(eq(providers.id, id), eq(providers.isActive, true), eq(providers.verificationStatus, "verified")))
    .limit(1);
  if (!provider) return jsonError("Business not found.", 404);
  const services = await db
    .select()
    .from(providerServices)
    .where(and(eq(providerServices.providerId, id), eq(providerServices.isActive, true)));
  return NextResponse.json({ provider, services });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isTrustedMutationRequest(request)) return jsonError("Request origin is not allowed.", 403);
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const [provider] = await db.select().from(providers).where(eq(providers.id, id)).limit(1);
    if (!provider) return jsonError("Business not found.", 404);
    if (provider.ownerUserId !== user.id) return jsonError("You don't own this listing.", 403);

    const json = await parseJsonBodyWithLimit(request);
    if (!json.ok) return jsonError("Request body is too large.", 413);
    const body = json.body;
    const parsed = providerUpdateSchema.safeParse(body);
    if (!parsed.success) return zodErrorResponse(parsed.error);

    const coordinatesChanged = parsed.data.lat !== undefined || parsed.data.lng !== undefined;
    if (coordinatesChanged) {
      const nextLat = parsed.data.lat !== undefined ? parsed.data.lat : provider.lat;
      const nextLng = parsed.data.lng !== undefined ? parsed.data.lng : provider.lng;
      if (!hasCompleteCoordinatePair(nextLat, nextLng)) {
        return jsonError("Latitude and longitude must be supplied together.", 422);
      }
    }

    let categoryId = provider.categoryId;
    if (parsed.data.categorySlug !== undefined) {
      if (!parsed.data.categorySlug) {
        categoryId = null;
      } else {
        const [cat] = await db
          .select({ id: placeCategories.id })
          .from(placeCategories)
          .where(eq(placeCategories.slug, parsed.data.categorySlug))
          .limit(1);
        if (!cat) return jsonError("Unknown business category.", 422);
        categoryId = cat.id;
      }
    }

    const { categorySlug: _categorySlug, ...rest } = parsed.data;
    void _categorySlug;

    // Editing identity/location/contact data after verification must trigger a
    // fresh verification review; otherwise a verified listing could be swapped
    // into an unrelated business without moderation.
    const hasMaterialChange = Object.keys(rest).length > 0 || parsed.data.categorySlug !== undefined;
    const verificationStatus = provider.verificationStatus === "verified" && hasMaterialChange ? "pending" : provider.verificationStatus;

    const [updated] = await db
      .update(providers)
      .set({ ...rest, categoryId, verificationStatus, updatedAt: new Date() })
      .where(eq(providers.id, id))
      .returning();

    return NextResponse.json({ provider: updated });
  } catch (error) {
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    throw error;
  }
}
