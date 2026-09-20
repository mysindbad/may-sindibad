import type { MetadataRoute } from "next";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { places } from "@/db/schema";
import { locales } from "@/i18n/config";
import { getTrustedAppOrigin } from "@/lib/app-origin";

// The app shipped a robots.txt that allows everything but no sitemap, so the
// only discoverable URL was the root redirect. Public, approved places are the
// content worth indexing; everything behind auth is deliberately left out.
const PUBLIC_ROUTES = ["", "/explore", "/marketplace", "/community"];

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = getTrustedAppOrigin();
  if (!origin) return [];

  const entries: MetadataRoute.Sitemap = [];
  const now = new Date();

  for (const locale of locales) {
    for (const route of PUBLIC_ROUTES) {
      entries.push({
        url: origin + "/" + locale + route,
        lastModified: now,
        changeFrequency: "daily",
        priority: route === "" ? 1 : 0.8,
      });
    }
  }

  // Cap the place list: a sitemap is a discovery hint, not a full export, and
  // this query runs on every crawl.
  let publicPlaces: Array<{ id: string; updatedAt: Date }> = [];
  try {
    publicPlaces = await db
      .select({ id: places.id, updatedAt: places.updatedAt })
      .from(places)
      .where(eq(places.status, "approved"))
      .orderBy(desc(places.ratingAverage))
      .limit(500);
  } catch {
    // A sitemap must never take the site down with it.
    return entries;
  }

  for (const place of publicPlaces) {
    for (const locale of locales) {
      entries.push({
        url: origin + "/" + locale + "/explore/" + place.id,
        lastModified: place.updatedAt,
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }
  }

  return entries;
}
