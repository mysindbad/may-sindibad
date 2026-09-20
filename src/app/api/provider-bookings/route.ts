import { NextResponse } from "next/server";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { bookings, providerServices, providers } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { isUnauthenticatedError, jsonError } from "@/lib/api-utils";
import { toProviderBookingView } from "@/lib/bookings/provider-view";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const owned = await db.select({ id: providers.id }).from(providers).where(eq(providers.ownerUserId, user.id));
    const providerIds = owned.map((row) => row.id);
    if (providerIds.length === 0) return NextResponse.json({ bookings: [] });

    const rows = await db
      .select({ booking: bookings, serviceName: providerServices.name })
      .from(bookings)
      .leftJoin(providerServices, eq(bookings.serviceId, providerServices.id))
      .where(inArray(bookings.providerId, providerIds))
      .orderBy(desc(bookings.createdAt));

    return NextResponse.json({
      bookings: rows.map(({ booking, serviceName }) => ({ booking: toProviderBookingView(booking), serviceName })),
    });
  } catch (error) {
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    throw error;
  }
}
