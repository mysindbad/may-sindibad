import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { favorites, places, providers } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { favoriteToggleSchema } from "@/lib/validation";
import { isUnauthenticatedError, jsonError, zodErrorResponse } from "@/lib/api-utils";
import { isTrustedMutationRequest } from "@/lib/security/mutation-origin";
import { parseJsonBodyWithLimit } from "@/lib/http/bounded-body";
import { favoriteTargetIsPublic } from "@/lib/domain/entity-access";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const rows = await db
      .select({
        id: favorites.id,
        targetType: favorites.targetType,
        targetId: favorites.targetId,
        createdAt: favorites.createdAt,
      })
      .from(favorites)
      .where(eq(favorites.userId, user.id));

    const placeIds = rows.filter((r) => r.targetType === "place").map((r) => r.targetId);
    const providerIds = rows.filter((r) => r.targetType === "provider").map((r) => r.targetId);

    const [placeRows, providerRows] = await Promise.all([
      placeIds.length
        ? db
            .select({
              id: places.id,
              name: places.name,
              description: places.description,
              categoryId: places.categoryId,
              city: places.city,
              country: places.country,
              address: places.address,
              lat: places.lat,
              lng: places.lng,
              priceLevel: places.priceLevel,
              coverImageUrl: places.coverImageUrl,
              ratingAverage: places.ratingAverage,
              ratingCount: places.ratingCount,
              sourceType: places.sourceType,
              status: places.status,
              confirmationsCount: places.confirmationsCount,
              providerId: places.providerId,
              createdAt: places.createdAt,
              updatedAt: places.updatedAt,
            })
            .from(places)
            .where(and(inArray(places.id, placeIds), eq(places.status, "approved")))
        : Promise.resolve([]),
      providerIds.length
        ? db
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
            .where(and(inArray(providers.id, providerIds), eq(providers.isActive, true), eq(providers.verificationStatus, "verified")))
        : Promise.resolve([]),
    ]);

    return NextResponse.json({ favorites: rows, places: placeRows, providers: providerRows });
  } catch (error) {
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    throw error;
  }
}

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return jsonError("Request origin is not allowed.", 403);
  try {
    const user = await requireUser();
    const json = await parseJsonBodyWithLimit(request);
    if (!json.ok) return jsonError("Request body is too large.", 413);
    const body = json.body;
    const parsed = favoriteToggleSchema.safeParse(body);
    if (!parsed.success) return zodErrorResponse(parsed.error);

    const { targetType, targetId } = parsed.data;
    if (!(await favoriteTargetIsPublic(targetType, targetId))) return jsonError("Favorite target not found.", 404);

    const existing = await db
      .select({ id: favorites.id })
      .from(favorites)
      .where(and(eq(favorites.userId, user.id), eq(favorites.targetType, targetType), eq(favorites.targetId, targetId)))
      .limit(1);

    if (existing.length > 0) {
      await db.delete(favorites).where(eq(favorites.id, existing[0].id));
      return NextResponse.json({ favorited: false });
    }

    const [inserted] = await db
      .insert(favorites)
      .values({ userId: user.id, targetType, targetId })
      .onConflictDoNothing()
      .returning({ id: favorites.id });

    // Concurrent identical "favorite" requests should converge on one saved
    // favorite instead of turning the database uniqueness constraint into a 500.
    void inserted;
    return NextResponse.json({ favorited: true });
  } catch (error) {
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    throw error;
  }
}
