import { notFound } from "next/navigation";
import { and, desc, eq, ilike } from "drizzle-orm";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/getDictionary";
import { db } from "@/db";
import { places } from "@/db/schema";
import { PlaceActions } from "@/components/backoffice/ModerationActions";
import { SectionTabs } from "@/components/backoffice/SectionTabs";

export const dynamic = "force-dynamic";

const STATUSES = ["approved", "pending", "flagged", "rejected"] as const;
type PlaceStatus = (typeof STATUSES)[number];

export default async function BackofficePlacesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;
  const dict = await getDictionary(locale);

  const { status: rawStatus, q } = await searchParams;
  const status: PlaceStatus = STATUSES.includes(rawStatus as PlaceStatus) ? (rawStatus as PlaceStatus) : "approved";
  const query = q?.trim() ?? "";

  const rows = await db
    .select()
    .from(places)
    .where(query ? and(eq(places.status, status), ilike(places.name, `%${query}%`)) : eq(places.status, status))
    .orderBy(desc(places.createdAt))
    .limit(100);

  const statusLabel: Record<PlaceStatus, string> = {
    approved: dict.backoffice.statusApproved,
    pending: dict.backoffice.statusPending,
    flagged: dict.backoffice.statusFlagged,
    rejected: dict.backoffice.statusRejected,
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-white">{dict.backoffice.navPlaces}</h1>
      </div>

      <SectionTabs basePath={`/${locale}/backoffice/places`} active={status} tabs={STATUSES.map((value) => ({ value, label: statusLabel[value] }))} />

      <form method="GET" className="relative">
        <input type="hidden" name="status" value={status} />
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder={dict.common.search}
          className="w-full rounded-xl border border-white/10 bg-slate-900 py-2.5 ps-4 pe-11 text-sm text-white outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-sky-500/40"
        />
        <button type="submit" aria-label={dict.common.search} className="absolute inset-y-0 end-0 flex items-center pe-3.5 text-slate-500">
          🔍
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-slate-900 p-4 text-sm text-slate-400">{dict.backoffice.noPlacesFound}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((place) => (
            <li key={place.id} className="rounded-2xl border border-white/10 bg-slate-900 p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-white">{place.name}</p>
                {place.ratingCount > 0 && (
                  <span className="shrink-0 text-xs text-slate-400">
                    ⭐ {place.ratingAverage} ({place.ratingCount})
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                {place.city}, {place.country} · {place.sourceType}
              </p>
              <PlaceActions placeId={place.id} status={place.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
