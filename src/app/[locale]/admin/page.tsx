import { notFound, redirect } from "next/navigation";
import { desc, eq, inArray } from "drizzle-orm";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/getDictionary";
import { getCurrentUser } from "@/lib/auth/session";
import { buildLoginPath } from "@/lib/auth/return-path";
import { db } from "@/db";
import { contributions, providers, reports } from "@/db/schema";
import { Badge, Card } from "@/components/ui/primitives";
import { EmptyState } from "@/components/ui/feedback";
import { ContributionActions, ReportActions, VerificationActions } from "@/components/admin/AdminActions";

// Moderation had backend endpoints but no screen anywhere in the product, so
// reports, verification requests and community contributions all piled up
// unreviewable. This is the operator view over those three queues.
export const dynamic = "force-dynamic";

export default async function AdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;
  const dict = await getDictionary(locale);

  const user = await getCurrentUser();
  if (!user) redirect(buildLoginPath(locale, "/" + locale + "/admin"));
  if (user.role !== "admin") {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <EmptyState icon="🔒" title={dict.admin.adminOnly} body={dict.errors.forbidden} />
      </div>
    );
  }

  const [openReports, pendingProviders, pendingContributions] = await Promise.all([
    db.select().from(reports).where(eq(reports.status, "open")).orderBy(desc(reports.createdAt)).limit(50),
    db
      .select()
      .from(providers)
      .where(inArray(providers.verificationStatus, ["pending", "unverified"]))
      .orderBy(desc(providers.createdAt))
      .limit(50),
    db.select().from(contributions).where(eq(contributions.status, "pending")).orderBy(desc(contributions.createdAt)).limit(50),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold text-brand-950 dark:text-sand-50">{dict.admin.title}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">{dict.admin.subtitle}</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-brand-950 dark:text-sand-50">
          {dict.admin.reports} {openReports.length > 0 && <Badge tone="sun">{openReports.length}</Badge>}
        </h2>
        {openReports.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{dict.admin.noReports}</p>
        ) : (
          openReports.map((report) => (
            <Card key={report.id} className="p-3">
              <p className="text-sm font-semibold text-brand-950 dark:text-sand-50">
                {dict.admin.reason}: {report.reason}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {dict.admin.target}: {report.targetType} · {report.targetId}
              </p>
              {report.details && <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{report.details}</p>}
              <ReportActions reportId={report.id} />
            </Card>
          ))
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-brand-950 dark:text-sand-50">
          {dict.admin.verification} {pendingProviders.length > 0 && <Badge tone="sun">{pendingProviders.length}</Badge>}
        </h2>
        {pendingProviders.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{dict.admin.noVerification}</p>
        ) : (
          pendingProviders.map((provider) => (
            <Card key={provider.id} className="p-3">
              <p className="text-sm font-semibold text-brand-950 dark:text-sand-50">{provider.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {provider.city}, {provider.country}
                {provider.phone ? " · " + provider.phone : ""}
              </p>
              {provider.description && <p className="mt-1 line-clamp-3 text-xs text-slate-600 dark:text-slate-400">{provider.description}</p>}
              <VerificationActions providerId={provider.id} />
            </Card>
          ))
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-brand-950 dark:text-sand-50">
          {dict.admin.contributions} {pendingContributions.length > 0 && <Badge tone="sun">{pendingContributions.length}</Badge>}
        </h2>
        {pendingContributions.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{dict.admin.noContributions}</p>
        ) : (
          pendingContributions.map((contribution) => (
            <Card key={contribution.id} className="p-3">
              <p className="text-sm font-semibold text-brand-950 dark:text-sand-50">{contribution.type}</p>
              <pre className="mt-1 max-h-32 overflow-auto rounded-lg bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                {JSON.stringify(contribution.payload, null, 2)}
              </pre>
              <ContributionActions contributionId={contribution.id} />
            </Card>
          ))
        )}
      </section>
    </div>
  );
}
