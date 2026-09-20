import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { providers, providerServices } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { providerServiceCreateSchema } from "@/lib/validation";
import { isUnauthenticatedError, jsonError, zodErrorResponse } from "@/lib/api-utils";
import { isTrustedMutationRequest } from "@/lib/security/mutation-origin";
import { parseJsonBodyWithLimit } from "@/lib/http/bounded-body";
import { checkRateLimit, clientKeyFromRequest } from "@/lib/rate-limit";

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return jsonError("Request origin is not allowed.", 403);
  try {
    const user = await requireUser();
    const rate = await checkRateLimit(clientKeyFromRequest(request, `provider-service:${user.id}`), 30, 60 * 60 * 1000);
    if (!rate.allowed) return jsonError("Too many service changes. Please slow down.", 429);

    const json = await parseJsonBodyWithLimit(request);
    if (!json.ok) return jsonError("Request body is too large.", 413);
    const body = json.body;
    const parsed = providerServiceCreateSchema.safeParse(body);
    if (!parsed.success) return zodErrorResponse(parsed.error);

    const [provider] = await db.select().from(providers).where(eq(providers.id, parsed.data.providerId)).limit(1);
    if (!provider) return jsonError("Business not found.", 404);
    if (provider.ownerUserId !== user.id) return jsonError("You don't own this listing.", 403);

    const { priceAmount, ...rest } = parsed.data;
    const [service] = await db
      .insert(providerServices)
      .values({ ...rest, priceAmount: priceAmount?.toString() })
      .returning();

    return NextResponse.json({ service }, { status: 201 });
  } catch (error) {
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    throw error;
  }
}
