import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/getDictionary";
import { db } from "@/db";
import { reports } from "@/db/schema";
import { ReportActions } from "@/components/backoffice/ModerationActions";
import { SectionTabs } from "@/components/backoffice/SectionTabs";

export const dynamic = "force-dynamic";

const STATUSES = ["open", "reviewed", "dismissed", "actioned"] as const;
type ReportStatus = (typeof STATUSES)[number];

export default async function BackofficeReportsPage({
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
  const status: ReportStatus = STATUSES.includes(rawStatus as ReportStatus) ? (rawStatus as ReportStatus) : "open";

  const rows = await db.select().from(reports).where(eq(reports.status, status)).orderBy(desc(reports.createdAt)).limit(100);

  const statusLabel: Record<ReportStatus, string> = {
    open: dict.backoffice.statusOpen,
    reviewed: dict.backoffice.statusReviewed,
    dismissed: dict.backoffice.statusDismissed,
    actioned: dict.backoffice.statusActioned,
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-white">{dict.backoffice.navReports}</h1>
      </div>

      <SectionTabs
        basePath={`/${locale}/backoffice/reports`}
        active={status}
        tabs={STATUSES.map((value) => ({ value, label: statusLabel[value] }))}
      />

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-slate-900 p-4 text-sm text-slate-400">{dict.admin.noReports}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((report) => (
            <li key={report.id} className="rounded-2xl border border-white/10 bg-slate-900 p-4">
              <p className="text-sm font-semibold text-white">
                {dict.admin.reason}: {report.reason}
              </p>
              <p className="text-xs text-slate-400">
                {dict.admin.target}: {report.targetType} · {report.targetId}
              </p>
              {report.details && <p className="mt-1 text-xs text-slate-300">{report.details}</p>}
              {status === "open" && <ReportActions reportId={report.id} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
