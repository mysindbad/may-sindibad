import Link from "next/link";
import { and, asc, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { getDictionary } from "@/i18n/getDictionary";
import { db } from "@/db";
import { placeCategories, places } from "@/db/schema";
import { PlaceActions } from "@/components/backoffice/ModerationActions";
import { SectionTabs } from "@/components/backoffice/SectionTabs";
import { PlaceImage } from "@/components/places/PlaceImage";
import { placeText } from "@/components/backoffice/places/strings";
import { categoryLabel } from "@/lib/domain/category-labels";
import { placeCategoryStyle } from "@/lib/domain/place-category";

export const dynamic = "force-dynamic";

const STATUSES = ["approved", "pending", "flagged", "rejected"] as const;
type PlaceStatus = (typeof STATUSES)[number];

const STATUS_BADGE: Record<PlaceStatus, string> = {
  approved: "bg-emerald-500/15 text-emerald-300",
  pending: "bg-amber-500/15 text-amber-300",
  flagged: "bg-rose-500/15 text-rose-300",
  rejected: "bg-slate-500/20 text-slate-300",
};

function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, "\\$&");
}

export default async function ControlRoomPlacesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; category?: string }>;
}) {
  const dict = await getDictionary("ar");
  const { status: rawStatus, q, category: rawCategory } = await searchParams;
  const status: PlaceStatus = STATUSES.includes(rawStatus as PlaceStatus) ? (rawStatus as PlaceStatus) : "approved";
  const query = q?.trim().slice(0, 200) ?? "";

  const categories = await db.select().from(placeCategories).orderBy(asc(placeCategories.sortOrder), asc(placeCategories.slug));
  const category = categories.find((c) => c.slug === rawCategory) ?? null;

  const conditions: SQL[] = [eq(places.status, status)];
  if (query) {
    const term = `%${escapeLike(query)}%`;
    conditions.push(or(ilike(places.name, term), ilike(places.city, term))!);
  }
  if (category) conditions.push(eq(places.categoryId, category.id));

  const rows = await db
    .select({
      id: places.id,
      name: places.name,
      city: places.city,
      country: places.country,
      status: places.status,
      sourceType: places.sourceType,
      coverImageUrl: places.coverImageUrl,
      ratingAverage: places.ratingAverage,
      ratingCount: places.ratingCount,
      categorySlug: placeCategories.slug,
    })
    .from(places)
    .leftJoin(placeCategories, eq(places.categoryId, placeCategories.id))
    .where(and(...conditions))
    .orderBy(desc(places.updatedAt))
    .limit(100);

  const statusLabel: Record<PlaceStatus, string> = {
    approved: placeText.tabPublished,
    pending: placeText.tabDrafts,
    flagged: placeText.tabReview,
    rejected: placeText.tabArchived,
  };
  const filtered = Boolean(query || category);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-white">{dict.backoffice.navPlaces}</h1>
        <Link href="/control-room/places/new" className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-400">
          + {placeText.addPlace}
        </Link>
      </div>

      <SectionTabs
        basePath="/control-room/places"
        active={status}
        tabs={STATUSES.map((value) => ({ value, label: statusLabel[value] }))}
        extraParams={{ q: query || undefined, category: category?.slug }}
      />

      <form method="GET" className="space-y-2">
        <input type="hidden" name="status" value={status} />
        <div className="relative">
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder={placeText.searchPlaceholder}
            className="w-full rounded-xl border border-white/10 bg-slate-900 py-2.5 ps-4 pe-11 text-sm text-white outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-sky-500/40"
          />
          <button type="submit" aria-label={dict.common.search} className="absolute inset-y-0 end-0 flex items-center pe-3.5 text-slate-500">
            🔍
          </button>
        </div>
        <select
          name="category"
          defaultValue={category?.slug ?? ""}
          className="w-full rounded-xl border border-white/10 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-200 outline-none"
        >
          <option value="">{placeText.allCategories}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.slug}>
              {categoryLabel(c.slug, dict)}
            </option>
          ))}
        </select>
        <button type="submit" className="sr-only">
          {dict.common.search}
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-slate-900 p-4 text-sm text-slate-400">
          {filtered ? placeText.filteredNone : placeText.noPlaces}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((place) => {
            const style = placeCategoryStyle(place.categorySlug, place.name);
            return (
              <li key={place.id} className="rounded-2xl border border-white/10 bg-slate-900 p-3.5">
                <div className="flex gap-3">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-800">
                    <PlaceImage
                      src={place.coverImageUrl}
                      className="h-full w-full object-cover"
                      fallback={
                        <div
                          title={placeText.noImage}
                          className={`flex h-full w-full items-center justify-center bg-gradient-to-br text-xl ${style.gradient}`}
                        >
                          <span aria-hidden="true">{style.icon}</span>
                        </div>
                      }
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-white">{place.name}</p>
                      {place.ratingCount > 0 && (
                        <span className="shrink-0 text-xs text-slate-400">
                          ⭐ {place.ratingAverage} ({place.ratingCount})
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-slate-400">
                      {place.city}, {place.country}
                      {place.categorySlug ? ` · ${categoryLabel(place.categorySlug, dict)}` : ""}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[place.status as PlaceStatus]}`}>
                        {statusLabel[place.status as PlaceStatus]}
                      </span>
                      <span className="text-[11px] text-slate-500">{place.sourceType}</span>
                      {!place.coverImageUrl && <span className="text-[11px] text-slate-500">{placeText.noImage}</span>}
                    </div>
                  </div>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Link
                    href={`/control-room/places/${place.id}`}
                    className="mt-2 rounded-lg bg-sky-500/20 px-2.5 py-1.5 text-xs font-medium text-sky-300 hover:bg-sky-500/30"
                  >
                    {placeText.edit}
                  </Link>
                  <div className="flex-1">
                    <PlaceActions placeId={place.id} status={place.status} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
