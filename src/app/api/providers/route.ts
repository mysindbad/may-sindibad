import { NextResponse } from "next/server";
import { and, eq, ilike } from "drizzle-orm";
import { db } from "@/db";
import { providers, placeCategories } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { providerCreateSchema } from "@/lib/validation";
import { isUnauthenticatedError, jsonError, zodErrorResponse } from "@/lib/api-utils";
import { isTrustedMutationRequest } from "@/lib/security/mutation-origin";
import { parseJsonBodyWithLimit } from "@/lib/http/bounded-body";
import { checkRateLimit, clientKeyFromRequest } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const city = searchParams.get("city")?.trim();
  const categorySlug = searchParams.get("category")?.trim();
  if ((city?.length ?? 0) > 120 || (categorySlug?.length ?? 0) > 60) {
    return jsonError("Search parameters are too long.", 400);
  }

  const conditions = [eq(providers.isActive, true), eq(providers.verificationStatus, "verified")];
  if (city) conditions.push(ilike(providers.city, `%${city}%`));

  let categoryId: string | undefined;
  if (categorySlug) {
    const [cat] = await db.select({ id: placeCategories.id }).from(placeCategories).where(eq(placeCategories.slug, categorySlug)).limit(1);
    categoryId = cat?.id;
    if (!categoryId) return NextResponse.json({ providers: [] });
    conditions.push(eq(providers.categoryId, categoryId));
  }

  const rows = await db
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
    .where(and(...conditions))
    .limit(40);

  return NextResponse.json({ providers: rows });
}

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return jsonError("Request origin is not allowed.", 403);
  try {
    const user = await requireUser();
    const rate = await checkRateLimit(clientKeyFromRequest(request, `provider-create:${user.id}`), 8, 24 * 60 * 60 * 1000);
    if (!rate.allowed) return jsonError("Too many business submissions. Please try again later.", 429);

    const json = await parseJsonBodyWithLimit(request);
    if (!json.ok) return jsonError("Request body is too large.", 413);
    const body = json.body;
    const parsed = providerCreateSchema.safeParse(body);
    if (!parsed.success) return zodErrorResponse(parsed.error);

    // The current provider workspace manages one business listing per account.
    // Prevent hidden second listings from being created through the API until
    // the product has an explicit multi-business selector/ownership UX.
    const [existingOwned] = await db.select({ id: providers.id }).from(providers).where(eq(providers.ownerUserId, user.id)).limit(1);
    if (existingOwned) return jsonError("This account already manages a business listing.", 409);

    let categoryId: string | null = null;
    if (parsed.data.categorySlug) {
      const [cat] = await db.select({ id: placeCategories.id }).from(placeCategories).where(eq(placeCategories.slug, parsed.data.categorySlug)).limit(1);
      if (!cat) return jsonError("Unknown business category.", 422);
      categoryId = cat.id;
    }

    const { categorySlug: _categorySlug, ...rest } = parsed.data;
    void _categorySlug;

    const [provider] = await db
      .insert(providers)
      .values({ ...rest, categoryId, ownerUserId: user.id, verificationStatus: "pending" })
      .onConflictDoNothing({ target: providers.ownerUserId })
      .returning();

    // The pre-check above gives the common request a useful early response,
    // while the database uniqueness constraint remains authoritative if two
    // create requests race concurrently.
    if (!provider) return jsonError("This account already manages a business listing.", 409);
    return NextResponse.json({ provider }, { status: 201 });
  } catch (error) {
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    throw error;
  }
}
