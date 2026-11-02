import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDictionary } from "@/i18n/getDictionary";
import { db } from "@/db";
import { reports } from "@/db/schema";
import { ReportActions } from "@/components/backoffice/ModerationActions";
import { SectionTabs } from "@/components/backoffice/SectionTabs";
import { reportReasonLabel, reviewText, targetTypeLabel } from "@/components/backoffice/review-strings";
import { loadReportTargets, targetKey } from "@/lib/data/report-targets";
import { adminHrefFor, excerpt } from "@/lib/domain/review-summary";

export const dynamic = "force-dynamic";

const STATUSES = ["open", "reviewed", "dismissed", "actioned"] as const;
type ReportStatus = (typeof STATUSES)[number];

export default async function ControlRoomReportsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const dict = await getDictionary("ar");
  const { status: rawStatus } = await searchParams;
  const status: ReportStatus = STATUSES.includes(rawStatus as ReportStatus) ? (rawStatus as ReportStatus) : "open";

  const rows = await db.select().from(reports).where(eq(reports.status, status)).orderBy(desc(reports.createdAt)).limit(100);
  const targets = await loadReportTargets(rows.map((row) => ({ type: row.targetType, id: row.targetId })));

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

      <SectionTabs basePath="/control-room/reports" active={status} tabs={STATUSES.map((value) => ({ value, label: statusLabel[value] }))} />

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-slate-900 p-4 text-sm text-slate-400">{dict.admin.noReports}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((report) => {
            const target = targets.get(targetKey(report.targetType, report.targetId));
            const href = adminHrefFor(report.targetType, report.targetId);
            const note = excerpt(report.details, 400);
            return (
              <li key={report.id} className="rounded-2xl border border-white/10 bg-slate-900 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-rose-500/15 px-2.5 py-0.5 text-xs font-medium text-rose-300">
                      {reportReasonLabel[report.reason] ?? report.reason}
                    </span>
                    <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-xs text-slate-300">
                      {targetTypeLabel[report.targetType] ?? report.targetType}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500">{report.createdAt.toISOString().slice(0, 10)}</span>
                </div>

                <div className="mt-3 rounded-xl bg-black/20 p-3">
                  <p className="mb-1 text-[11px] text-slate-500">{reviewText.target}</p>
                  {target?.missing || !target ? (
                    <p className="text-xs text-amber-300">{reviewText.targetMissing}</p>
                  ) : (
                    <div className="space-y-1">
                      {target.title && <p className="break-words text-sm font-semibold text-white">{target.title}</p>}
                      {target.subtitle && <p className="text-xs text-slate-400">{target.subtitle}</p>}
                      {target.excerpt && <p className="break-words text-xs leading-relaxed text-slate-300">{target.excerpt}</p>}
                    </div>
                  )}
                  {href && !target?.missing && (
                    <Link href={href} className="mt-2 inline-block text-xs text-sky-300 underline">
                      {reviewText.openItem}
                    </Link>
                  )}
                </div>

                {note && (
                  <p className="mt-2 break-words text-xs text-slate-300">
                    <span className="text-slate-500">{reviewText.reporterNote}: </span>
                    {note}
                  </p>
                )}

                {status === "open" && <ReportActions reportId={report.id} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
