import { isLocale, type Locale } from "@/i18n/config";
import { notFound, redirect } from "next/navigation";
import { getDictionary } from "@/i18n/getDictionary";
import { getCurrentUser } from "@/lib/auth/session";
import { buildLoginPath } from "@/lib/auth/return-path";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, providers, providerServices } from "@/db/schema";
import { Card } from "@/components/ui/primitives";
import { BookingStatusBadge } from "@/components/bookings/BookingStatusBadge";
import { BookingActions } from "@/components/bookings/BookingActions";
import { formatCurrency } from "@/lib/utils";
import { isPaymentsConfigured } from "@/lib/payments";

export const dynamic = "force-dynamic";

export default async function BookingDetailPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: rawLocale, id } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;
  const dict = await getDictionary(locale);

  const user = await getCurrentUser();
  if (!user) redirect(buildLoginPath(locale, `/${locale}/bookings/${id}`));

  const [booking] = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
  if (!booking || booking.userId !== user.id) notFound();

  const [provider] = booking.providerId ? await db.select().from(providers).where(eq(providers.id, booking.providerId)).limit(1) : [];
  const [service] = booking.serviceId ? await db.select().from(providerServices).where(eq(providerServices.id, booking.serviceId)).limit(1) : [];

  return (
    <div className="mx-auto max-w-xl space-y-5 px-4 py-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-brand-950 dark:text-sand-50">{provider?.name ?? "Booking"}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{service?.name}</p>
        </div>
        <BookingStatusBadge status={booking.status} dict={dict} />
      </div>

      <Card className="space-y-2 p-4 text-sm">
        <Row label={dict.bookings.total} value={formatCurrency(booking.totalAmount, booking.currency, locale)} />
        <Row label={dict.bookings.guests} value={String(booking.guestsCount)} />
        <Row label={dict.bookings.contact} value={`${booking.contactName} · ${booking.contactEmail}`} />
        {booking.startDate && <Row label={dict.bookings.date} value={booking.startDate} />}
      </Card>

      <BookingActions bookingId={booking.id} status={booking.status} paymentsConfigured={isPaymentsConfigured()} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-slate-100 pb-2 last:border-0 last:pb-0">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="font-medium text-brand-950 dark:text-sand-50">{value}</span>
    </div>
  );
}
