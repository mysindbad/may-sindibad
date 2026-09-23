import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/getDictionary";
import { db } from "@/db";
import { contributions } from "@/db/schema";
import { ContributionActions } from "@/components/backoffice/ModerationActions";
import { SectionTabs } from "@/components/backoffice/SectionTabs";

export const dynamic = "force-dynamic";

const STATUSES = ["pending", "approved", "rejected", "flagged"] as const;
type ContributionStatus = (typeof STATUSES)[number];

export default async function BackofficeContributionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;
  const dict = await getDictionary(locale);

  const { status: rawStatus } = await searchParams;
  const status: ContributionStatus = STATUSES.includes(rawStatus as ContributionStatus) ? (rawStatus as ContributionStatus) : "pending";

  const rows = await db.select().from(contributions).where(eq(contributions.status, status)).orderBy(desc(contributions.createdAt)).limit(100);

  const statusLabel: Record<ContributionStatus, string> = {
    pending: dict.backoffice.statusPending,
    approved: dict.backoffice.statusApproved,
    rejected: dict.backoffice.statusRejected,
    flagged: dict.backoffice.statusFlagged,
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-white">{dict.backoffice.navContributions}</h1>
      </div>

      <SectionTabs
        basePath={`/${locale}/backoffice/contributions`}
        active={status}
        tabs={STATUSES.map((value) => ({ value, label: statusLabel[value] }))}
      />

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-slate-900 p-4 text-sm text-slate-400">{dict.admin.noContributions}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((contribution) => (
            <li key={contribution.id} className="rounded-2xl border border-white/10 bg-slate-900 p-4">
              <p className="text-sm font-semibold text-white">{contribution.type}</p>
              <pre className="mt-1 max-h-32 overflow-auto rounded-lg bg-black/30 p-2 text-[11px] leading-relaxed text-slate-400">
                {JSON.stringify(contribution.payload, null, 2)}
              </pre>
              {status === "pending" && <ContributionActions contributionId={contribution.id} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
