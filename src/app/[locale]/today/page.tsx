import Link from "next/link";
import { and, asc, eq, gte, isNull, lte } from "drizzle-orm";
import { isLocale, type Locale } from "@/i18n/config";
import { notFound } from "next/navigation";
import { getDictionary } from "@/i18n/getDictionary";
import { db } from "@/db";
import { trips, tripDays, itineraryItems } from "@/db/schema";
import { getOwnerContext } from "@/lib/auth/owner-context";
import { getPlacesByCity } from "@/lib/data/places";
import { getCurrentWeather, isWeatherConfigured } from "@/lib/weather";
import { Card, Button } from "@/components/ui/primitives";
import { EmptyState } from "@/components/ui/feedback";
import { PlaceCard } from "@/components/places/PlaceCard";
import { placeTrustLabel } from "@/components/places/trust";
import { dateKeyInTimeZone, getRequestTimeZone, minutesInTimeZone } from "@/lib/timezone";

export const dynamic = "force-dynamic";

export default async function TodayPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;
  const dict = await getDictionary(locale);
  const owner = await getOwnerContext();
  const timeZone = await getRequestTimeZone();

  const now = new Date();
  const today = dateKeyInTimeZone(now, timeZone);
  const ownerFilter = owner.userId ? eq(trips.userId, owner.userId) : owner.guestId ? and(isNull(trips.userId), eq(trips.guestId, owner.guestId)) : undefined;

  let activeTrip = ownerFilter
    ? (
        await db
          .select()
          .from(trips)
          .where(and(ownerFilter, eq(trips.status, "active"), lte(trips.startDate, today), gte(trips.endDate, today)))
          .orderBy(asc(trips.startDate))
          .limit(1)
      )[0]
    : undefined;

  if (!activeTrip && ownerFilter) {
    activeTrip = (
      await db
        .select()
        .from(trips)
        .where(and(ownerFilter, eq(trips.status, "planned"), lte(trips.startDate, today), gte(trips.endDate, today)))
        .orderBy(asc(trips.startDate))
        .limit(1)
    )[0];
  }

  if (!activeTrip) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <EmptyState
          icon="☀️"
          title={dict.today.noActiveTrip}
          body={dict.today.noActiveTripBody}
          action={
            <Link href={`/${locale}/trips/new`}>
              <Button>{dict.today.planATrip}</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const [todayDay] = await db.select().from(tripDays).where(and(eq(tripDays.tripId, activeTrip.id), eq(tripDays.date, today))).limit(1);
  const items = todayDay
    ? await db.select().from(itineraryItems).where(eq(itineraryItems.tripDayId, todayDay.id)).orderBy(asc(itineraryItems.sortOrder))
    : [];

  const currentMinutes = minutesInTimeZone(now, timeZone);
  const upcoming = items.find((item) => {
    if (!item.startTime) return false;
    const [h, m] = item.startTime.split(":").map(Number);
    return h * 60 + m >= currentMinutes && item.status !== "skipped";
  });

  const nearby = await getPlacesByCity(activeTrip.destinationCity, 6, activeTrip.destinationCountry);
  const weatherAnchor = nearby[0];
  const weather = weatherAnchor && isWeatherConfigured() ? await getCurrentWeather(weatherAnchor.lat, weatherAnchor.lng) : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-brand-950">{dict.today.title}</h1>
        <div className="text-sm text-slate-500">
          {weather ? `${weather.temperatureC}°C · ${weather.condition}` : dict.today.weatherUnavailable}
        </div>
      </div>

      <Card className="p-4">
        <p className="text-xs uppercase tracking-wide text-slate-400">{activeTrip.title}</p>
        <p className="text-sm text-slate-600">{activeTrip.destinationCity}, {activeTrip.destinationCountry}</p>
      </Card>

      <section>
        <h2 className="mb-2 text-base font-semibold text-brand-950">{dict.today.nextUp}</h2>
        {upcoming ? (
          <Card className="p-4">
            <p className="text-sm font-semibold text-brand-950">
              {upcoming.startTime} · {upcoming.title}
            </p>
            {upcoming.notes && <p className="mt-1 text-xs text-slate-500">{upcoming.notes}</p>}
          </Card>
        ) : (
          <p className="text-sm text-slate-500">{dict.today.nothingScheduled}</p>
        )}
        <Link href={`/${locale}/trips/${activeTrip.id}`} className="mt-2 inline-block text-xs font-medium text-sky-600">
          {dict.today.viewFullItinerary} →
        </Link>
      </section>

      {nearby.length > 0 && (
        <section>
          <h2 className="mb-2 text-base font-semibold text-brand-950">{dict.today.nearbyNow}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {nearby.map((place) => (
              <PlaceCard key={place.id} place={place} locale={locale} trustLabel={placeTrustLabel(place.sourceType, dict)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
