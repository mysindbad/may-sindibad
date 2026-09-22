import Link from "next/link";
import { isLocale, type Locale } from "@/i18n/config";
import { notFound } from "next/navigation";
import { getDictionary } from "@/i18n/getDictionary";
import { db } from "@/db";
import { providers } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { Card, Badge, Button } from "@/components/ui/primitives";
import { EmptyState } from "@/components/ui/feedback";

export const dynamic = "force-dynamic";

const VERIFICATION_LABEL_KEY = {
  unverified: "verificationUnverified",
  pending: "verificationPending",
  verified: "verificationVerified",
  suspended: "verificationUnverified",
} as const;

export default async function MarketplacePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;
  const dict = await getDictionary(locale);

  const rows = await db.select().from(providers).where(and(eq(providers.isActive, true), eq(providers.verificationStatus, "verified"))).limit(30);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-brand-950 dark:text-sand-50">{dict.marketplace.title}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{dict.marketplace.subtitle}</p>
        </div>
        <Link href={`/${locale}/provider`}>
          <Button size="sm" variant="secondary">
            {dict.nav.becomeProvider}
          </Button>
        </Link>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="🏪" title={dict.marketplace.noListings} body={dict.marketplace.noListingsBody} />
      ) : (
        <ul className="mt-5 space-y-3">
          {rows.map((provider) => (
            <li key={provider.id}>
              <Link href={`/${locale}/marketplace/${provider.id}`}>
                <Card className="flex items-center justify-between p-4 hover:shadow-[var(--shadow-elevated)]">
                  <div>
                    <p className="text-sm font-semibold text-brand-950 dark:text-sand-50">{provider.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {provider.city}, {provider.country}
                    </p>
                  </div>
                  <Badge tone={provider.verificationStatus === "verified" ? "lime" : "neutral"}>
                    {dict.marketplace[VERIFICATION_LABEL_KEY[provider.verificationStatus]]}
                  </Badge>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
