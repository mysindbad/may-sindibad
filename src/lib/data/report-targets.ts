import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { communityPosts, contributions, places, providers, reviews, users } from "@/db/schema";
import { excerpt } from "@/lib/domain/review-summary";

export interface ReportTargetSummary {
  /** The row no longer exists (deleted, cascaded away). */
  missing: boolean;
  title: string | null;
  subtitle: string | null;
  excerpt: string | null;
}

const MISSING: ReportTargetSummary = { missing: true, title: null, subtitle: null, excerpt: null };

interface TargetRef {
  type: string;
  id: string;
}

const key = (type: string, id: string) => `${type}:${id}`;

/**
 * What each reported item is, so a moderator can decide without leaving the
 * page: name, place, and a short excerpt of the text. One query per target
 * type, not per report. Privacy: people appear by display name only - never
 * by email - and text is cut to a short excerpt.
 */
export async function loadReportTargets(refs: TargetRef[]): Promise<Map<string, ReportTargetSummary>> {
  const result = new Map<string, ReportTargetSummary>();
  const idsOf = (type: string) => [...new Set(refs.filter((r) => r.type === type).map((r) => r.id))];

  const placeIds = idsOf("place");
  if (placeIds.length > 0) {
    const rows = await db
      .select({ id: places.id, name: places.name, city: places.city, country: places.country, status: places.status, description: places.description })
      .from(places)
      .where(inArray(places.id, placeIds));
    for (const row of rows) {
      result.set(key("place", row.id), { missing: false, title: row.name, subtitle: `${row.city}, ${row.country} · ${row.status}`, excerpt: excerpt(row.description, 200) });
    }
  }

  const providerIds = idsOf("provider");
  if (providerIds.length > 0) {
    const rows = await db
      .select({ id: providers.id, name: providers.name, city: providers.city, country: providers.country, description: providers.description })
      .from(providers)
      .where(inArray(providers.id, providerIds));
    for (const row of rows) {
      result.set(key("provider", row.id), { missing: false, title: row.name, subtitle: `${row.city}, ${row.country}`, excerpt: excerpt(row.description, 200) });
    }
  }

  const reviewIds = idsOf("review");
  if (reviewIds.length > 0) {
    const rows = await db
      .select({ id: reviews.id, rating: reviews.rating, comment: reviews.comment, authorName: users.name, status: reviews.status })
      .from(reviews)
      .innerJoin(users, eq(users.id, reviews.userId))
      .where(inArray(reviews.id, reviewIds));
    for (const row of rows) {
      result.set(key("review", row.id), { missing: false, title: `${"★".repeat(row.rating)} · ${row.authorName}`, subtitle: row.status, excerpt: excerpt(row.comment, 200) });
    }
  }

  const postIds = idsOf("community_post");
  if (postIds.length > 0) {
    const rows = await db
      .select({ id: communityPosts.id, title: communityPosts.title, body: communityPosts.body, authorName: users.name, status: communityPosts.status })
      .from(communityPosts)
      .innerJoin(users, eq(users.id, communityPosts.userId))
      .where(inArray(communityPosts.id, postIds));
    for (const row of rows) {
      result.set(key("community_post", row.id), { missing: false, title: row.title ?? row.authorName, subtitle: `${row.authorName} · ${row.status}`, excerpt: excerpt(row.body, 240) });
    }
  }

  const userIds = idsOf("user");
  if (userIds.length > 0) {
    const rows = await db.select({ id: users.id, name: users.name, role: users.role }).from(users).where(inArray(users.id, userIds));
    for (const row of rows) {
      result.set(key("user", row.id), { missing: false, title: row.name, subtitle: row.role, excerpt: null });
    }
  }

  const contributionIds = idsOf("contribution");
  if (contributionIds.length > 0) {
    const rows = await db
      .select({ id: contributions.id, type: contributions.type, payload: contributions.payload, status: contributions.status })
      .from(contributions)
      .where(inArray(contributions.id, contributionIds));
    for (const row of rows) {
      const payload = row.payload && typeof row.payload === "object" ? (row.payload as Record<string, unknown>) : {};
      result.set(key("contribution", row.id), {
        missing: false,
        title: excerpt(payload.name, 120) ?? row.type,
        subtitle: `${row.type} · ${row.status}`,
        excerpt: excerpt(payload.description, 200),
      });
    }
  }

  for (const ref of refs) {
    if (!result.has(key(ref.type, ref.id))) result.set(key(ref.type, ref.id), MISSING);
  }
  return result;
}

export const targetKey = key;
