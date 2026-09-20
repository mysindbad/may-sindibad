import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/getDictionary";
import { db } from "@/db";
import { providers, providerServices } from "@/db/schema";
import { Badge, Card } from "@/components/ui/primitives";
import { BookingForm } from "@/components/marketplace/BookingForm";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ProviderDetailPage({ params }: { params: Promise<{ locale: string; providerId: string }> }) {
  const { locale: rawLocale, providerId } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;
  const dict = await getDictionary(locale);

  const [provider] = await db.select().from(providers).where(and(eq(providers.id, providerId), eq(providers.isActive, true), eq(providers.verificationStatus, "verified"))).limit(1);
  if (!provider) notFound();

  const services = await db.select().from(providerServices).where(and(eq(providerServices.providerId, providerId), eq(providerServices.isActive, true)));

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
      </div>

      {provider.description && <p className="text-sm text-slate-700">{provider.description}</p>}

      <section>
        <h2 className="mb-2 text-base font-semibold text-brand-950">{dict.marketplace.services}</h2>
        <div className="space-y-2">
          {services.map((service) => (
            <Card key={service.id} className="p-3">
              <p className="text-sm font-semibold text-brand-950">{service.name}</p>
              {service.description && <p className="text-xs text-slate-500">{service.description}</p>}
              {service.priceAmount && (
                <p className="mt-1 text-xs font-medium text-sky-700">{formatCurrency(service.priceAmount, service.priceCurrency, locale)}</p>
              )}
            </Card>
          ))}
          {services.length === 0 && <p className="text-sm text-slate-500">{dict.marketplace.noServices}</p>}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold text-brand-950">{dict.bookings.bookNow}</h2>
        <BookingForm
          providerId={provider.id}
          services={services
            .filter((s) => s.priceAmount !== null)
            .map((s) => ({ id: s.id, name: s.name, category: s.category, priceAmount: s.priceAmount, priceCurrency: s.priceCurrency }))}
        />
      </section>
    </div>
  );
}
