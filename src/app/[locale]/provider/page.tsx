import { isLocale, type Locale } from "@/i18n/config";
import { notFound, redirect } from "next/navigation";
import { getDictionary } from "@/i18n/getDictionary";
import { getCurrentUser } from "@/lib/auth/session";
import { buildLoginPath } from "@/lib/auth/return-path";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, providers, providerServices } from "@/db/schema";
import { ProviderOnboarding } from "@/components/provider/ProviderOnboarding";
import { ServiceForm } from "@/components/provider/ServiceForm";
import { Badge, Card } from "@/components/ui/primitives";
import { formatCurrency } from "@/lib/utils";
import { ProviderBookingActions } from "@/components/provider/ProviderBookingActions";
import { BookingStatusBadge } from "@/components/bookings/BookingStatusBadge";
import { BusinessEditForm } from "@/components/provider/BusinessEditForm";
import { ServiceActions } from "@/components/provider/ServiceActions";

export const dynamic = "force-dynamic";

export default async function ProviderDashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;
  const dict = await getDictionary(locale);

  const user = await getCurrentUser();
  if (!user) redirect(buildLoginPath(locale, `/${locale}/provider`));

  const myProviders = await db.select().from(providers).where(eq(providers.ownerUserId, user.id));

  if (myProviders.length === 0) {
    return <ProviderOnboarding />;
  }

  const provider = myProviders[0];
  const services = await db.select().from(providerServices).where(eq(providerServices.providerId, provider.id));
  const providerBookings = await db
    .select({ booking: bookings, serviceName: providerServices.name })
    .from(bookings)
    .leftJoin(providerServices, eq(bookings.serviceId, providerServices.id))
    .where(eq(bookings.providerId, provider.id))
    .orderBy(desc(bookings.createdAt))
    .limit(50);

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold text-brand-950">{provider.name}</h1>
        <p className="text-sm text-slate-500">
          {provider.city}, {provider.country}
        </p>
        <Badge tone={provider.verificationStatus === "verified" ? "lime" : "neutral"} className="mt-2">
          {provider.verificationStatus === "verified" ? dict.marketplace.verificationVerified : dict.marketplace.verificationPending}
        </Badge>
        <div className="mt-3">
          <BusinessEditForm
            provider={{
              id: provider.id,
              name: provider.name,
              description: provider.description,
              city: provider.city,
              country: provider.country,
              address: provider.address,
              phone: provider.phone,
              website: provider.website,
              verificationStatus: provider.verificationStatus,
            }}
          />
        </div>
      </div>


      <section className="space-y-3">
        <h2 className="text-base font-semibold text-brand-950">{dict.bookings.providerRequests}</h2>
        {providerBookings.length === 0 ? (
          <p className="text-sm text-slate-500">{dict.bookings.noProviderRequests}</p>
        ) : (
          providerBookings.map(({ booking, serviceName }) => (
            <Card key={booking.id} className="space-y-3 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-brand-950">{serviceName ?? dict.bookings.title}</p>
                  <p className="text-xs text-slate-500">{booking.startDate ?? "—"} · {booking.guestsCount} · {formatCurrency(booking.totalAmount, booking.currency, locale)}</p>
                </div>
                <BookingStatusBadge status={booking.status} dict={dict} />
              </div>
              {booking.status === "pending" && <ProviderBookingActions bookingId={booking.id} />}
            </Card>
          ))
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-brand-950">{dict.marketplace.services}</h2>
        {services.length === 0 && <p className="text-sm text-slate-500">{dict.providerTools.noServices}</p>}
        {services.map((service) => (
          <Card key={service.id} className="p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-brand-950">{service.name}</p>
                <p className="text-xs text-slate-500">{service.category}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {!service.isActive && <Badge tone="neutral">{dict.providerTools.inactive}</Badge>}
                {service.priceAmount && (
                  <span className="text-xs font-medium text-sky-700">{formatCurrency(service.priceAmount, service.priceCurrency, locale)}</span>
                )}
              </div>
            </div>
            <ServiceActions
              service={{ id: service.id, name: service.name, priceAmount: service.priceAmount, isActive: service.isActive }}
            />
          </Card>
        ))}
        <ServiceForm providerId={provider.id} />
      </section>
    </div>
  );
}
