import Link from "next/link";
import { isLocale, type Locale } from "@/i18n/config";
import { notFound } from "next/navigation";
import { getDictionary } from "@/i18n/getDictionary";
import { getOwnerContext } from "@/lib/auth/owner-context";
import { getRecommendedPlaces, getHiddenGems, getPlacesByCity } from "@/lib/data/places";
import { getRelevantTrip } from "@/lib/data/trips";
import { getLatestCommunityPost } from "@/lib/data/community";
import { getCurrentWeather, isWeatherConfigured, type WeatherSnapshot } from "@/lib/weather";
import { currentDayPart } from "@/lib/travel-context";
import { dateKeyInTimeZone, getRequestTimeZone } from "@/lib/timezone";
import { formatDateRange } from "@/lib/utils";
import { PlaceCard } from "@/components/places/PlaceCard";
import { placeTrustLabel } from "@/components/places/trust";
import { NearbyDiscovery } from "@/components/home/NearbyDiscovery";
import { Card } from "@/components/ui/primitives";

const COMMUNITY_CHIPS = [
  { kind: "story", icon: "📖", gradient: "from-violet-500 to-purple-400", labelKey: "kindStory", captionKey: "captionStory" },
  { kind: "place", icon: "📍", gradient: "from-emerald-500 to-teal-400", labelKey: "kindPlace", captionKey: "captionPlace" },
  { kind: "tip", icon: "💡", gradient: "from-rose-500 to-pink-400", labelKey: "kindTip", captionKey: "captionTip" },
  { kind: "moment", icon: "📷", gradient: "from-amber-500 to-orange-400", labelKey: "kindMoment", captionKey: "captionMoment" },
] as const;

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
  const [recommended, hiddenGems, activeTrip, latestPost] = await Promise.all([
    getRecommendedPlaces(undefined, 6),
    getHiddenGems(undefined, 6),
    getRelevantTrip(owner, today),
    getLatestCommunityPost(),
  ]);

  // A traveller mid-trip benefits from seeing today's weather at their
  // destination right on the home screen, not just after tapping through to
  // Today - the same live Open-Meteo lookup that page already uses, anchored
  // on one real place in the destination city for coordinates.
  let tripWeather: WeatherSnapshot | null = null;
  if (activeTrip && isWeatherConfigured()) {
    const [anchor] = await getPlacesByCity(activeTrip.destinationCity, 1, activeTrip.destinationCountry);
    if (anchor) tripWeather = await getCurrentWeather(anchor.lat, anchor.lng);
  }

  const dayPart = currentDayPart(timeZone);
  const greeting = dict.home[GREETING_KEY[dayPart]];

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-6">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-900 via-brand-800 to-sky-600 p-6 text-white shadow-[var(--shadow-elevated)] sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-sky-400/20 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-24 -left-12 h-56 w-56 rounded-full bg-turquoise-400/15 blur-3xl" aria-hidden="true" />
        <div className="relative">
          <p className="text-sm font-medium text-sky-200">{greeting}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">{dict.home.heroTitlePlanner}</h1>
          <p className="mt-2 max-w-md text-sm text-sky-100">{dict.home.heroSubtitle}</p>
          <form action={`/${locale}/explore`} method="GET" className="relative mt-5">
            <input
              type="text"
              name="city"
              placeholder={dict.home.searchPlaceholder}
              className="w-full rounded-xl border border-white/20 bg-white/95 py-3 ps-4 pe-11 text-sm text-brand-950 shadow-sm placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-white/40"
            />
            <button type="submit" aria-label={dict.common.search} className="absolute inset-y-0 end-0 flex items-center pe-3.5 text-slate-400">
              🔍
            </button>
          </form>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link
              href={`/${locale}/ai`}
              className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-brand-900 shadow-md transition-shadow hover:shadow-lg"
            >
              ✨ {dict.home.askSindbad}
            </Link>
          </div>
        </div>
      </section>

      {activeTrip && (
        <section>
          <h2 className="mb-3 text-base font-semibold text-brand-950 dark:text-sand-50">{dict.home.tripContextTitle}</h2>
          <Link href={`/${locale}/today`}>
            <Card className="flex items-center justify-between gap-3 p-4 hover:shadow-[var(--shadow-elevated)]">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-brand-950 dark:text-sand-50">{activeTrip.title}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {activeTrip.destinationCity} · {formatDateRange(activeTrip.startDate, activeTrip.endDate, locale)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {tripWeather && (
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                    {tripWeather.icon} {tripWeather.temperatureC}°C
                  </span>
                )}
                <span className="text-sky-600">→</span>
              </div>
            </Card>
          </Link>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-brand-950 dark:text-sand-50">{dict.home.communityCta}</h2>
          <Link href={`/${locale}/community`} className="text-xs font-medium text-sky-600">
            {dict.common.seeAll}
          </Link>
        </div>
        <div className="mb-3 grid grid-cols-4 gap-2">
          {COMMUNITY_CHIPS.map((chip) => (
            <Link key={chip.kind} href={`/${locale}/community`} className="flex flex-col items-center gap-1.5 text-center">
              <span className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${chip.gradient} text-xl text-white shadow-sm`}>
                {chip.icon}
              </span>
              <span className="text-xs font-semibold text-brand-950 dark:text-sand-50">{dict.communityFeed[chip.labelKey]}</span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">{dict.communityFeed[chip.captionKey]}</span>
            </Link>
          ))}
        </div>
        {latestPost && (
          <Link href={`/${locale}/community`}>
            <Card className="flex gap-3 overflow-hidden p-3 hover:shadow-[var(--shadow-elevated)]">
              {latestPost.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- remote uploads come from arbitrary S3/local hosts, not the local image loader's fixed domain list.
                <img src={latestPost.imageUrl} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-brand-950 dark:text-sand-50">{latestPost.authorName}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-slate-600 dark:text-slate-400">{latestPost.title ?? latestPost.body}</p>
              </div>
            </Card>
          </Link>
        )}
      </section>

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
            <h2 className="text-base font-semibold text-brand-950 dark:text-sand-50">💎 {dict.home.hiddenGemsTitle}</h2>
            <Link href={`/${locale}/explore`} className="text-xs font-medium text-sky-600">
              {dict.common.seeAll}
            </Link>
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-turquoise-500/10 via-turquoise-500/5 to-transparent p-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {hiddenGems.map((place) => (
                <PlaceCard key={place.id} place={place} locale={locale} trustLabel={placeTrustLabel(place.sourceType, dict)} />
              ))}
            </div>
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
