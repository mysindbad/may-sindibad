import Link from "next/link";
import { isLocale, type Locale } from "@/i18n/config";
import { notFound } from "next/navigation";
import { getDictionary } from "@/i18n/getDictionary";
import { getOwnerContext } from "@/lib/auth/owner-context";
import { getRecommendedPlaces, getHiddenGems } from "@/lib/data/places";
import { getRelevantTrip } from "@/lib/data/trips";
import { currentDayPart } from "@/lib/travel-context";
import { dateKeyInTimeZone, getRequestTimeZone } from "@/lib/timezone";
import { formatDateRange } from "@/lib/utils";
import { PlaceCard } from "@/components/places/PlaceCard";
import { placeTrustLabel } from "@/components/places/trust";
import { NearbyDiscovery } from "@/components/home/NearbyDiscovery";
import { Card } from "@/components/ui/primitives";

const GREETING_KEY = {
  morning: "greetingMorning",
  afternoon: "greetingAfternoon",
  evening: "greetingEvening",
  night: "greetingNight",
} as const;

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;

  const [dict, owner, timeZone] = await Promise.all([getDictionary(locale), getOwnerContext(), getRequestTimeZone()]);
  const today = dateKeyInTimeZone(new Date(), timeZone);
  const [recommended, hiddenGems, activeTrip] = await Promise.all([
    getRecommendedPlaces(undefined, 6),
    getHiddenGems(undefined, 6),
    getRelevantTrip(owner, today),
  ]);

  const dayPart = currentDayPart(timeZone);
  const greeting = dict.home[GREETING_KEY[dayPart]];

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-6">
      <section className="rounded-3xl bg-gradient-to-br from-brand-900 via-brand-800 to-sky-600 p-6 text-white shadow-[var(--shadow-elevated)] sm:p-8">
        <p className="text-sm text-sky-200">{greeting}</p>
        <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{dict.home.heroTitlePlanner}</h1>
        <p className="mt-2 max-w-md text-sm text-sky-100">{dict.home.heroSubtitle}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href={`/${locale}/ai`} className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-brand-900 shadow-sm">
            ✨ {dict.home.askSindbad}
          </Link>
          <Link href={`/${locale}/explore`} className="rounded-xl border border-white/30 px-4 py-2.5 text-sm font-semibold text-white">
            🧭 {dict.home.exploreCta}
          </Link>
        </div>
      </section>

      {activeTrip && (
        <section>
          <h2 className="mb-3 text-base font-semibold text-brand-950 dark:text-sand-50">{dict.home.tripContextTitle}</h2>
          <Link href={`/${locale}/today`}>
            <Card className="flex items-center justify-between p-4 hover:shadow-[var(--shadow-elevated)]">
              <div>
                <p className="text-sm font-semibold text-brand-950 dark:text-sand-50">{activeTrip.title}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {activeTrip.destinationCity} · {formatDateRange(activeTrip.startDate, activeTrip.endDate, locale)}
                </p>
              </div>
              <span className="text-sky-600">→</span>
            </Card>
          </Link>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-brand-950 dark:text-sand-50">{dict.home.nearbyTitle}</h2>
        </div>
        <NearbyDiscovery />
      </section>

      {recommended.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-brand-950 dark:text-sand-50">{dict.home.recommendedTitle}</h2>
            <Link href={`/${locale}/explore`} className="text-xs font-medium text-sky-600">
              {dict.common.seeAll}
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {recommended.map((place) => (
              <PlaceCard key={place.id} place={place} locale={locale} trustLabel={placeTrustLabel(place.sourceType, dict)} />
            ))}
          </div>
        </section>
      )}

      {hiddenGems.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-brand-950 dark:text-sand-50">{dict.home.hiddenGemsTitle}</h2>
            <Link href={`/${locale}/explore`} className="text-xs font-medium text-sky-600">
              {dict.common.seeAll}
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {hiddenGems.map((place) => (
              <PlaceCard key={place.id} place={place} locale={locale} trustLabel={placeTrustLabel(place.sourceType, dict)} />
            ))}
          </div>
        </section>
      )}

      <section>
        <Card className="flex flex-col items-start gap-2 border-dashed p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-brand-950 dark:text-sand-50">{dict.marketplace.becomeProviderTitle}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{dict.marketplace.becomeProviderBody}</p>
          </div>
          <Link href={`/${locale}/marketplace`} className="shrink-0 rounded-lg bg-brand-800 px-4 py-2 text-xs font-semibold text-white">
            {dict.nav.becomeProvider}
          </Link>
        </Card>
      </section>
    </div>
  );
}
