import Link from "next/link";
import { isLocale, type Locale } from "@/i18n/config";
import { notFound, redirect } from "next/navigation";
import { getDictionary } from "@/i18n/getDictionary";
import { getCurrentUser } from "@/lib/auth/session";
import { buildLoginPath } from "@/lib/auth/return-path";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, providers } from "@/db/schema";
import { Card } from "@/components/ui/primitives";
import { EmptyState } from "@/components/ui/feedback";
import { BookingStatusBadge } from "@/components/bookings/BookingStatusBadge";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function BookingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;
  const dict = await getDictionary(locale);

  const user = await getCurrentUser();
  if (!user) redirect(buildLoginPath(locale, `/${locale}/bookings`));

  const rows = await db
    .select({ booking: bookings, providerName: providers.name })
    .from(bookings)
    .leftJoin(providers, eq(bookings.providerId, providers.id))
    .where(eq(bookings.userId, user.id))
    .orderBy(desc(bookings.createdAt));

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-5 text-xl font-semibold text-brand-950">{dict.bookings.title}</h1>

      {rows.length === 0 ? (
        <EmptyState icon="🧾" title={dict.bookings.emptyTitle} body={dict.bookings.emptyBody} />
      ) : (
        <ul className="space-y-3">
          {rows.map(({ booking, providerName }) => (
            <li key={booking.id}>
              <Link href={`/${locale}/bookings/${booking.id}`}>
                <Card className="flex items-center justify-between p-4 hover:shadow-[var(--shadow-elevated)]">
                  <div>
                    <p className="text-sm font-semibold text-brand-950">{providerName ?? "Booking"}</p>
                    <p className="text-xs text-slate-500">{formatCurrency(booking.totalAmount, booking.currency, locale)}</p>
                  </div>
                  <BookingStatusBadge status={booking.status} dict={dict} />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
