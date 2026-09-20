import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/getDictionary";
import { getCurrentUser } from "@/lib/auth/session";
import { buildLoginPath } from "@/lib/auth/return-path";
import { db } from "@/db";
import { favorites, places, providers } from "@/db/schema";
import { Badge, Card } from "@/components/ui/primitives";
import { EmptyState } from "@/components/ui/feedback";
import { PlaceCard } from "@/components/places/PlaceCard";
import { placeTrustLabel } from "@/components/places/trust";

// Saving a place or business was already possible (the heart in PlaceDetail
// writes to /api/favorites), but nothing in the app ever listed what had been
// saved. This is the missing read side of that feature.
export const dynamic = "force-dynamic";

export default async function FavoritesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;
  const dict = await getDictionary(locale);

  const user = await getCurrentUser();
  if (!user) redirect(buildLoginPath(locale, "/" + locale + "/favorites"));

  const rows = await db
    .select({ targetType: favorites.targetType, targetId: favorites.targetId })
    .from(favorites)
    .where(eq(favorites.userId, user.id))
    .orderBy(desc(favorites.createdAt));

  const placeIds = rows.filter((row) => row.targetType === "place").map((row) => row.targetId);
  const providerIds = rows.filter((row) => row.targetType === "provider").map((row) => row.targetId);

  // Only surface targets that are still publicly visible, mirroring the same
  // filters /api/favorites applies, so an unpublished place cannot leak here.
  const [savedPlaces, savedProviders] = await Promise.all([
    placeIds.length > 0
      ? db
          .select()
          .from(places)
          .where(and(inArray(places.id, placeIds), eq(places.status, "approved")))
      : Promise.resolve([]),
    providerIds.length > 0
      ? db
          .select()
          .from(providers)
          .where(
            and(
              inArray(providers.id, providerIds),
              eq(providers.isActive, true),
              eq(providers.verificationStatus, "verified"),
            ),
          )
      : Promise.resolve([]),
  ]);

  const isEmpty = savedPlaces.length === 0 && savedProviders.length === 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold text-brand-950">{dict.favorites.title}</h1>
        <p className="text-sm text-slate-500">{dict.favorites.subtitle}</p>
      </div>

      {isEmpty ? (
        <EmptyState icon="🤍" title={dict.favorites.empty} body={dict.favorites.emptyBody} />
      ) : (
        <>
          {savedPlaces.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-brand-950">{dict.favorites.places}</h2>
              <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {savedPlaces.map((place) => (
                  <li key={place.id}>
                    <PlaceCard place={place} locale={locale} trustLabel={placeTrustLabel(place.sourceType, dict)} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {savedProviders.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-brand-950">{dict.favorites.businesses}</h2>
              <ul className="space-y-3">
                {savedProviders.map((provider) => (
                  <li key={provider.id}>
                    <Link href={"/" + locale + "/marketplace/" + provider.id}>
                      <Card className="flex items-center justify-between p-4 hover:shadow-[var(--shadow-elevated)]">
                        <div>
                          <p className="text-sm font-semibold text-brand-950">{provider.name}</p>
                          <p className="text-xs text-slate-500">
                            {provider.city}, {provider.country}
                          </p>
                        </div>
                        <Badge tone="lime">{dict.marketplace.verificationVerified}</Badge>
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
