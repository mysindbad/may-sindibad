import { NextResponse } from "next/server";
import { and, avg, count, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookings, contributions, favorites, media, places, providers, reports, reviews, sponsoredPlacements, users } from "@/db/schema";
import { requireUser, requireFreshUser, destroySession } from "@/lib/auth/session";
import { updateProfileSchema } from "@/lib/validation";
import { isUnauthenticatedError, jsonError, zodErrorResponse } from "@/lib/api-utils";
import { isTrustedMutationRequest } from "@/lib/security/mutation-origin";
import { parseJsonBodyWithLimit } from "@/lib/http/bounded-body";
import { deleteLocalStoredUpload, deleteUpload } from "@/lib/storage";
import type { BookingStatus } from "@/lib/domain/booking-state-machine";

class ActiveAccountBookingError extends Error {
  constructor() {
    super("ACTIVE_ACCOUNT_BOOKING");
    this.name = "ActiveAccountBookingError";
  }
}

export async function PATCH(request: Request) {
  if (!isTrustedMutationRequest(request)) return jsonError("Request origin is not allowed.", 403);
  try {
    const user = await requireUser();
    const json = await parseJsonBodyWithLimit(request);
    if (!json.ok) return jsonError("Request body is too large.", 413);
    const body = json.body;
    const parsed = updateProfileSchema.safeParse(body);
    if (!parsed.success) return zodErrorResponse(parsed.error);

    const previousAvatarUrl = user.avatarUrl;

    const [updated] = await db
      .update(users)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(users.id, user.id))
      .returning();

    // The new photo is already saved and the account already points at it -
    // the old file is now unreachable from anywhere in the app, so remove it
    // rather than leaving it in storage forever. Best-effort: a delete
    // failure here must not undo an otherwise-successful profile update.
    if ("avatarUrl" in parsed.data && previousAvatarUrl && previousAvatarUrl !== updated.avatarUrl) {
      await deleteUpload(previousAvatarUrl).catch(() => {});
    }

    return NextResponse.json({
      user: { id: updated.id, email: updated.email, name: updated.name, role: updated.role, locale: updated.locale, avatarUrl: updated.avatarUrl, homeCity: updated.homeCity },
    });
  } catch (error) {
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    throw error;
  }
}

export async function DELETE(request: Request) {
  if (!isTrustedMutationRequest(request)) return jsonError("Request origin is not allowed.", 403);
  try {
    const user = await requireFreshUser();

    const uploadedMedia = await db.transaction(async (tx) => {
      // Serialize account deletion against new traveler bookings and against
      // new provider/business rows that reference this user. PostgreSQL FK
      // checks take key-share locks on the referenced row and therefore wait
      // behind this FOR UPDATE lock instead of slipping in after our checks.
      await tx.execute(sql`select id from users where id = ${user.id} for update`);
      await tx.execute(sql`select id from providers where owner_user_id = ${user.id} for update`);

      // Provider deletion cascades through services and provider reviews.
      // Polymorphic tables cannot express those foreign keys in PostgreSQL,
      // so collect affected ids and clean their references explicitly before
      // the user/provider rows disappear.
      const ownedProviders = await tx.select({ id: providers.id }).from(providers).where(eq(providers.ownerUserId, user.id));
      const providerIds = ownedProviders.map((row) => row.id);
      const activeBookingStatuses: BookingStatus[] = ["draft", "pending", "awaiting_payment", "confirmed"];

      const [activeTravelerBooking] = await tx
        .select({ id: bookings.id })
        .from(bookings)
        .where(and(eq(bookings.userId, user.id), inArray(bookings.status, activeBookingStatuses)))
        .limit(1);
      const [activeProviderBooking] = providerIds.length
        ? await tx
            .select({ id: bookings.id })
            .from(bookings)
            .where(and(inArray(bookings.providerId, providerIds), inArray(bookings.status, activeBookingStatuses)))
            .limit(1)
        : [undefined];

      if (activeTravelerBooking || activeProviderBooking) throw new ActiveAccountBookingError();

      // Preserve legitimate completed/cancelled/refunded financial/booking
      // records without retaining the deleted traveler's contact details or
      // notes. Active bookings are blocked above so fulfilment cannot be broken
      // by anonymization.
      await tx
        .update(bookings)
        .set({
          userId: null,
          guestId: null,
          contactName: null,
          contactEmail: null,
          contactPhone: null,
          notes: null,
          cancelledReason: null,
          updatedAt: new Date(),
        })
        .where(eq(bookings.userId, user.id));

      const ownReviews = await tx.select({ id: reviews.id, placeId: reviews.placeId }).from(reviews).where(eq(reviews.userId, user.id));
      const providerReviews = providerIds.length
        ? await tx.select({ id: reviews.id }).from(reviews).where(inArray(reviews.providerId, providerIds))
        : [];
      const reviewIds = [...new Set([...ownReviews, ...providerReviews].map((row) => row.id))];
      const reviewedPlaceIds = [...new Set(ownReviews.map((row) => row.placeId).filter((id): id is string => Boolean(id)))];
      const ownContributions = await tx
        .select({ id: contributions.id })
        .from(contributions)
        .where(eq(contributions.submittedByUserId, user.id));
      const contributionIds = ownContributions.map((row) => row.id);

      if (providerIds.length > 0) {
        await tx.update(places).set({ providerId: null, updatedAt: new Date() }).where(inArray(places.providerId, providerIds));
        await tx.delete(favorites).where(and(eq(favorites.targetType, "provider"), inArray(favorites.targetId, providerIds)));
        await tx.delete(reports).where(and(eq(reports.targetType, "provider"), inArray(reports.targetId, providerIds)));
        await tx
          .delete(sponsoredPlacements)
          .where(and(eq(sponsoredPlacements.targetType, "provider"), inArray(sponsoredPlacements.targetId, providerIds)));
      }
      if (reviewIds.length > 0) {
        await tx.delete(reports).where(and(eq(reports.targetType, "review"), inArray(reports.targetId, reviewIds)));
      }
      if (contributionIds.length > 0) {
        await tx.delete(reports).where(and(eq(reports.targetType, "contribution"), inArray(reports.targetId, contributionIds)));
      }
      await tx.delete(reports).where(and(eq(reports.targetType, "user"), eq(reports.targetId, user.id)));

      const files = await tx
        .delete(media)
        .where(eq(media.uploadedByUserId, user.id))
        .returning({ url: media.url });

      if (providerIds.length > 0) {
        files.push(
          ...(await tx
            .delete(media)
            .where(and(eq(media.ownerType, "provider"), inArray(media.ownerId, providerIds)))
            .returning({ url: media.url })),
        );
      }
      if (reviewIds.length > 0) {
        files.push(
          ...(await tx
            .delete(media)
            .where(and(eq(media.ownerType, "review"), inArray(media.ownerId, reviewIds)))
            .returning({ url: media.url })),
        );
      }
      if (contributionIds.length > 0) {
        files.push(
          ...(await tx
            .delete(media)
            .where(and(eq(media.ownerType, "contribution"), inArray(media.ownerId, contributionIds)))
            .returning({ url: media.url })),
        );
      }
      files.push(
        ...(await tx
          .delete(media)
          .where(and(eq(media.ownerType, "avatar"), eq(media.ownerId, user.id)))
          .returning({ url: media.url })),
      );

      await tx.delete(users).where(eq(users.id, user.id));

      // User deletion cascades their review rows. Rebuild cached place rating
      // aggregates in the same transaction so public scores never retain a
      // deleted review. Use the same advisory lock as review creation to avoid
      // racing a review submitted at the same time.
      for (const placeId of reviewedPlaceIds) {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${placeId}))`);
        const [agg] = await tx
          .select({ average: avg(reviews.rating), total: count(reviews.id) })
          .from(reviews)
          .where(and(eq(reviews.placeId, placeId), eq(reviews.status, "published")));
        await tx
          .update(places)
          .set({ ratingAverage: Number(agg.average ?? 0), ratingCount: Number(agg.total ?? 0), updatedAt: new Date() })
          .where(eq(places.id, placeId));
      }

      return files;
    });

    // DB state is authoritative. File cleanup is best-effort and happens only
    // after the transaction commits so filesystem errors cannot restore PII.
    await Promise.allSettled(uploadedMedia.map((item) => deleteLocalStoredUpload(item.url)));
    await destroySession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ActiveAccountBookingError) {
      return jsonError("Active bookings must be completed or resolved before deleting this account.", 409, { code: "active_bookings" });
    }
    if (isUnauthenticatedError(error)) return jsonError("Please log in to continue.", 401);
    if (error instanceof Error && error.name === "ReauthenticationRequiredError") {
      return jsonError("Please sign in again before deleting your account.", 403, { code: "reauth_required" });
    }
    throw error;
  }
}
