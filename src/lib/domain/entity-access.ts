import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { communityPosts, contributions, places, providers, reviews, users } from "@/db/schema";

export type UploadOwnerType = "place" | "provider" | "review" | "contribution" | "avatar" | "community_post";
export type ReportTargetType = "place" | "provider" | "review" | "contribution" | "user" | "community_post";
export type FavoriteTargetType = "place" | "provider";

export async function resolveAuthorizedUploadOwner(userId: string, ownerType: UploadOwnerType, ownerId?: string): Promise<string | null> {
  if (ownerType === "avatar") {
    if (ownerId && ownerId !== userId) return null;
    return userId;
  }
  if (!ownerId) return null;

  if (ownerType === "provider") {
    const [row] = await db
      .select({ id: providers.id })
      .from(providers)
      .where(and(eq(providers.id, ownerId), eq(providers.ownerUserId, userId)))
      .limit(1);
    return row?.id ?? null;
  }

  if (ownerType === "review") {
    const [row] = await db
      .select({ id: reviews.id })
      .from(reviews)
      .where(and(eq(reviews.id, ownerId), eq(reviews.userId, userId)))
      .limit(1);
    return row?.id ?? null;
  }

  if (ownerType === "contribution") {
    const [row] = await db
      .select({ id: contributions.id })
      .from(contributions)
      .where(and(eq(contributions.id, ownerId), eq(contributions.submittedByUserId, userId)))
      .limit(1);
    return row?.id ?? null;
  }

  if (ownerType === "community_post") {
    const [row] = await db
      .select({ id: communityPosts.id })
      .from(communityPosts)
      .where(and(eq(communityPosts.id, ownerId), eq(communityPosts.userId, userId)))
      .limit(1);
    return row?.id ?? null;
  }

  const [place] = await db
    .select({ id: places.id, createdByUserId: places.createdByUserId, providerId: places.providerId })
    .from(places)
    .where(eq(places.id, ownerId))
    .limit(1);
  if (!place) return null;
  if (place.createdByUserId === userId) return place.id;
  if (place.providerId) {
    const [provider] = await db
      .select({ id: providers.id })
      .from(providers)
      .where(and(eq(providers.id, place.providerId), eq(providers.ownerUserId, userId)))
      .limit(1);
    if (provider) return place.id;
  }
  return null;
}

export async function favoriteTargetIsPublic(targetType: FavoriteTargetType, targetId: string): Promise<boolean> {
  if (targetType === "place") {
    const [row] = await db
      .select({ id: places.id })
      .from(places)
      .where(and(eq(places.id, targetId), eq(places.status, "approved")))
      .limit(1);
    return Boolean(row);
  }

  const [row] = await db
    .select({ id: providers.id })
    .from(providers)
    .where(and(eq(providers.id, targetId), eq(providers.isActive, true), eq(providers.verificationStatus, "verified")))
    .limit(1);
  return Boolean(row);
}

export async function targetExists(targetType: ReportTargetType | FavoriteTargetType, targetId: string): Promise<boolean> {
  if (targetType === "place") {
    const [row] = await db.select({ id: places.id }).from(places).where(eq(places.id, targetId)).limit(1);
    return Boolean(row);
  }
  if (targetType === "provider") {
    const [row] = await db.select({ id: providers.id }).from(providers).where(eq(providers.id, targetId)).limit(1);
    return Boolean(row);
  }
  if (targetType === "review") {
    const [row] = await db.select({ id: reviews.id }).from(reviews).where(eq(reviews.id, targetId)).limit(1);
    return Boolean(row);
  }
  if (targetType === "contribution") {
    const [row] = await db.select({ id: contributions.id }).from(contributions).where(eq(contributions.id, targetId)).limit(1);
    return Boolean(row);
  }
  if (targetType === "user") {
    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.id, targetId)).limit(1);
    return Boolean(row);
  }
  if (targetType === "community_post") {
    const [row] = await db.select({ id: communityPosts.id }).from(communityPosts).where(eq(communityPosts.id, targetId)).limit(1);
    return Boolean(row);
  }
  return false;
}
