import Link from "next/link";
import { count, eq, inArray, sum } from "drizzle-orm";
import { notFound } from "next/navigation";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/getDictionary";
import { db } from "@/db";
import { bookings, contributions, payments, places, providers, reports, reviews, users } from "@/db/schema";
import { StatCard } from "@/components/backoffice/StatCard";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function BackofficeOverviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;
  const dict = await getDictionary(locale);

  const [
    [userCount],
    [placeCount],
    [openReportCount],
    [pendingProviderCount],
    [pendingContributionCount],
    [flaggedReviewCount],
    [confirmedBookingCount],
    revenueRows,
  ] = await Promise.all([
    db.select({ value: count() }).from(users),
    db.select({ value: count() }).from(places).where(eq(places.status, "approved")),
    db.select({ value: count() }).from(reports).where(eq(reports.status, "open")),
    db.select({ value: count() }).from(providers).where(inArray(providers.verificationStatus, ["pending", "unverified"])),
    db.select({ value: count() }).from(contributions).where(eq(contributions.status, "pending")),
    db.select({ value: count() }).from(reviews).where(eq(reviews.status, "flagged")),
    db.select({ value: count() }).from(bookings).where(eq(bookings.status, "confirmed")),
    db
      .select({ currency: payments.currency, total: sum(payments.amount) })
      .from(payments)
      .where(eq(payments.status, "succeeded"))
      .groupBy(payments.currency),
  ]);

  const attentionItems = [
    { href: "/backoffice/reports", count: openReportCount.value, label: dict.backoffice.statOpenReports, icon: "🚩" },
    { href: "/backoffice/providers", count: pendingProviderCount.value, label: dict.backoffice.statPendingProviders, icon: "🏪" },
    { href: "/backoffice/contributions", count: pendingContributionCount.value, label: dict.backoffice.statPendingContributions, icon: "📝" },
    { href: "/backoffice/reviews", count: flaggedReviewCount.value, label: dict.backoffice.statFlaggedReviews, icon: "⭐" },
  ].filter((item) => item.count > 0);

  const revenueDisplay =
    revenueRows.length === 0
      ? formatCurrency(0, "USD")
      : revenueRows.map((row) => formatCurrency(row.total ?? 0, row.currency, locale)).join(" · ");

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-white">{dict.backoffice.navOverview}</h1>
        <p className="text-sm text-slate-400">{dict.backoffice.tagline}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard icon="👥" label={dict.backoffice.statUsers} value={userCount.value} />
        <StatCard icon="📍" label={dict.backoffice.statPlaces} value={placeCount.value} />
        <StatCard icon="🚩" label={dict.backoffice.statOpenReports} value={openReportCount.value} tone="warning" />
        <StatCard icon="🏪" label={dict.backoffice.statPendingProviders} value={pendingProviderCount.value} tone="warning" />
        <StatCard icon="📝" label={dict.backoffice.statPendingContributions} value={pendingContributionCount.value} tone="warning" />
        <StatCard icon="⭐" label={dict.backoffice.statFlaggedReviews} value={flaggedReviewCount.value} tone="warning" />
        <StatCard icon="🧳" label={dict.backoffice.statBookings} value={confirmedBookingCount.value} />
        <StatCard icon="💰" label={dict.backoffice.statRevenue} value={revenueDisplay} />
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">{dict.backoffice.quickActions}</h2>
        {attentionItems.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-slate-900 p-4 text-sm text-slate-400">{dict.backoffice.noAttentionNeeded}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {attentionItems.map((item) => (
              <Link
                key={item.href}
                href={`/${locale}${item.href}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 transition-colors hover:bg-amber-400/10"
              >
                <span className="flex items-center gap-2.5 text-sm font-medium text-slate-100">
                  <span aria-hidden="true">{item.icon}</span>
                  {item.label}
                </span>
                <span className="grid h-7 min-w-7 place-items-center rounded-full bg-amber-400/20 px-2 text-sm font-semibold text-amber-300">
                  {item.count}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
