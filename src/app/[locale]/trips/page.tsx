import Link from "next/link";
import { isLocale, type Locale } from "@/i18n/config";
import { notFound } from "next/navigation";
import { getDictionary } from "@/i18n/getDictionary";
import { getOwnerContext } from "@/lib/auth/owner-context";
import { getTripsForOwner } from "@/lib/data/trips";
import { formatDateRange } from "@/lib/utils";
import { Card, Button } from "@/components/ui/primitives";
import { EmptyState } from "@/components/ui/feedback";
import { TripStatusBadge } from "@/components/trips/TripStatusBadge";

export const dynamic = "force-dynamic";

export default async function TripsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;

  const [dict, owner] = await Promise.all([getDictionary(locale), getOwnerContext()]);
  const trips = await getTripsForOwner(owner);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-brand-950 dark:text-sand-50">{dict.trips.title}</h1>
        <Link href={`/${locale}/trips/new`}>
          <Button size="sm">+ {dict.trips.newTrip}</Button>
        </Link>
      </div>

      {trips.length === 0 ? (
        <EmptyState
          icon="🗺️"
          title={dict.trips.emptyTitle}
          body={dict.trips.emptyBody}
          action={
            <Link href={`/${locale}/trips/new`}>
              <Button>{dict.trips.newTrip}</Button>
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {trips.map((trip) => (
            <li key={trip.id}>
              <Link href={`/${locale}/trips/${trip.id}`}>
                <Card className="flex items-center justify-between p-4 hover:shadow-[var(--shadow-elevated)]">
                  <div>
                    <p className="text-sm font-semibold text-brand-950 dark:text-sand-50">{trip.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {trip.destinationCity}, {trip.destinationCountry} · {formatDateRange(trip.startDate, trip.endDate, locale)}
                    </p>
                  </div>
                  <TripStatusBadge status={trip.status} dict={dict} />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
