import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { providers, providerServices } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { isUnauthenticatedError, jsonError } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const rows = await db.select().from(providers).where(eq(providers.ownerUserId, user.id));
    const providerIds = rows.map((r) => r.id);
    const services = providerIds.length
      ? await db.select().from(providerServices).where(inArray(providerServices.providerId, providerIds))
      : [];
    return NextResponse.json({ providers: rows, services });
  } catch (error) {
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    throw error;
  }
}
