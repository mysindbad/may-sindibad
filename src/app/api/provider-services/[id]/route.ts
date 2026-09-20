import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { providers, providerServices } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { providerServiceUpdateSchema } from "@/lib/validation";
import { isUnauthenticatedError, jsonError, zodErrorResponse } from "@/lib/api-utils";
import { isTrustedMutationRequest } from "@/lib/security/mutation-origin";
import { parseJsonBodyWithLimit } from "@/lib/http/bounded-body";
import { checkRateLimit, clientKeyFromRequest } from "@/lib/rate-limit";

async function loadOwnedService(id, userId) {
  const [row] = await db
    .select({ service: providerServices, providerOwnerUserId: providers.ownerUserId })
    .from(providerServices)
    .innerJoin(providers, eq(providerServices.providerId, providers.id))
    .where(eq(providerServices.id, id))
    .limit(1);
  if (!row) return { error: jsonError("Service not found.", 404) };
  if (row.providerOwnerUserId !== userId) return { error: jsonError("You don't own this listing.", 403) };
  return { service: row.service };
}

export async function PATCH(request, context) {
  if (!isTrustedMutationRequest(request)) return jsonError("Request origin is not allowed.", 403);
  try {
    const user = await requireUser();
    const rate = await checkRateLimit(clientKeyFromRequest(request, "provider-service:" + user.id), 30, 60 * 60 * 1000);
    if (!rate.allowed) return jsonError("Too many service changes. Please slow down.", 429);

    const { id } = await context.params;
    const owned = await loadOwnedService(id, user.id);
    if ("error" in owned) return owned.error;

    const json = await parseJsonBodyWithLimit(request);
    if (!json.ok) return jsonError("Request body is too large.", 413);
    const parsed = providerServiceUpdateSchema.safeParse(json.body);
    if (!parsed.success) return zodErrorResponse(parsed.error);

    const { priceAmount, ...rest } = parsed.data;
    if (Object.keys(parsed.data).length === 0) return jsonError("No changes supplied.", 422);

    const [service] = await db
      .update(providerServices)
      .set({
        ...rest,
        ...(priceAmount !== undefined ? { priceAmount: priceAmount.toString() } : {}),
        updatedAt: new Date(),
      })
      .where(eq(providerServices.id, id))
      .returning();

    return NextResponse.json({ service });
  } catch (error) {
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    throw error;
  }
}

export async function DELETE(request, context) {
  if (!isTrustedMutationRequest(request)) return jsonError("Request origin is not allowed.", 403);
  try {
    const user = await requireUser();
    const rate = await checkRateLimit(clientKeyFromRequest(request, "provider-service:" + user.id), 30, 60 * 60 * 1000);
    if (!rate.allowed) return jsonError("Too many service changes. Please slow down.", 429);

    const { id } = await context.params;
    const owned = await loadOwnedService(id, user.id);
    if ("error" in owned) return owned.error;

    const [service] = await db
      .update(providerServices)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(providerServices.id, id))
      .returning();

    return NextResponse.json({ service });
  } catch (error) {
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    throw error;
  }
}
