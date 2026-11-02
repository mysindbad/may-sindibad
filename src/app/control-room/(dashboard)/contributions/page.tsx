import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDictionary } from "@/i18n/getDictionary";
import { db } from "@/db";
import { contributions, users } from "@/db/schema";
import { SectionTabs } from "@/components/backoffice/SectionTabs";
import { ContributionReview } from "@/components/backoffice/ContributionReview";
import { contributionTypeLabel, reviewText } from "@/components/backoffice/review-strings";
import { contributionCoordinates, contributionFields } from "@/lib/domain/review-summary";
import { isImplementedContributionType, type CommunityContributionType } from "@/lib/domain/community-contributions";

export const dynamic = "force-dynamic";

const STATUSES = ["pending", "approved", "rejected", "flagged"] as const;
type ContributionStatus = (typeof STATUSES)[number];

const FIELD_LABEL: Record<string, string> = {
  name: reviewText.fieldName,
  city: reviewText.fieldCity,
  country: reviewText.fieldCountry,
  address: reviewText.fieldAddress,
  description: reviewText.fieldDescription,
};

export default async function ControlRoomContributionsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const dict = await getDictionary("ar");
  const { status: rawStatus } = await searchParams;
  const status: ContributionStatus = STATUSES.includes(rawStatus as ContributionStatus) ? (rawStatus as ContributionStatus) : "pending";

  // Display name only: contributors' emails stay out of the review screen.
  const rows = await db
    .select({
      id: contributions.id,
      type: contributions.type,
      payload: contributions.payload,
      placeId: contributions.placeId,
      confirmationsCount: contributions.confirmationsCount,
      reviewNote: contributions.reviewNote,
      createdAt: contributions.createdAt,
      submitterName: users.name,
    })
    .from(contributions)
    .innerJoin(users, eq(users.id, contributions.submittedByUserId))
    .where(eq(contributions.status, status))
    .orderBy(desc(contributions.createdAt))
    .limit(100);

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

      <SectionTabs basePath="/control-room/contributions" active={status} tabs={STATUSES.map((value) => ({ value, label: statusLabel[value] }))} />

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-slate-900 p-4 text-sm text-slate-400">{dict.admin.noContributions}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((contribution) => {
            const fields = contributionFields(contribution.payload);
            const coordinates = contributionCoordinates(contribution.payload);
            return (
              <li key={contribution.id} className="rounded-2xl border border-white/10 bg-slate-900 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-full bg-sky-500/15 px-2.5 py-0.5 text-xs font-medium text-sky-300">
                    {contributionTypeLabel[contribution.type] ?? contribution.type}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {reviewText.by} {contribution.submitterName} · {contribution.createdAt.toISOString().slice(0, 10)}
                    {contribution.confirmationsCount > 0 ? ` · ${reviewText.confirmations}: ${contribution.confirmationsCount}` : ""}
                  </span>
                </div>

                {fields.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-400">{reviewText.noDetails}</p>
                ) : (
                  <dl className="mt-3 space-y-1.5 text-sm">
                    {fields.map((field) => (
                      <div key={field.key} className="flex gap-2">
                        <dt className="w-20 shrink-0 text-xs text-slate-500">{FIELD_LABEL[field.key] ?? field.key}</dt>
                        <dd className="min-w-0 flex-1 break-words text-slate-200">{field.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}

                {contribution.reviewNote && <p className="mt-2 text-xs text-slate-400">{contribution.reviewNote}</p>}

                {status === "pending" && (
                  <ContributionReview
                    contributionId={contribution.id}
                    type={contribution.type}
                    supported={isImplementedContributionType(contribution.type as CommunityContributionType)}
                    submittedCoordinates={coordinates}
                  />
                )}

                {status === "approved" && contribution.placeId && (
                  <Link href={`/control-room/places/${contribution.placeId}`} className="mt-3 inline-block text-xs text-sky-300 underline">
                    {reviewText.openPlace}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
