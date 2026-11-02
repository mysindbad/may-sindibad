import "server-only";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { placeCategories } from "@/db/schema";
import { categoryLabel } from "@/lib/domain/category-labels";
import type { Dictionary } from "@/i18n/dictionaries/en";
import type { EditorCategory } from "./PlaceEditor";

export async function loadEditorCategories(dict: Dictionary): Promise<EditorCategory[]> {
  const rows = await db.select().from(placeCategories).orderBy(asc(placeCategories.sortOrder), asc(placeCategories.slug));
  return rows.map((row) => ({ id: row.id, slug: row.slug, label: categoryLabel(row.slug, dict) }));
}
