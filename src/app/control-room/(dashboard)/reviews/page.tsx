import { desc, eq } from "drizzle-orm";
import { getDictionary } from "@/i18n/getDictionary";
import { db } from "@/db";
import { places, providers, reviews, users } from "@/db/schema";
import { ReviewActions } from "@/components/backoffice/ModerationActions";
import { SectionTabs } from "@/components/backoffice/SectionTabs";

export const dynamic = "force-dynamic";

const STATUSES = ["flagged", "published", "removed"] as const;
type ReviewStatus = (typeof STATUSES)[number];

export default async function ControlRoomReviewsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const dict = await getDictionary("ar");
  const { status: rawStatus } = await searchParams;
  const status: ReviewStatus = STATUSES.includes(rawStatus as ReviewStatus) ? (rawStatus as ReviewStatus) : "flagged";

  const rows = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      comment: reviews.comment,
      status: reviews.status,
      createdAt: reviews.createdAt,
      authorName: users.name,
      placeName: places.name,
      providerName: providers.name,
    })
    .from(reviews)
    .innerJoin(users, eq(reviews.userId, users.id))
    .leftJoin(places, eq(reviews.placeId, places.id))
    .leftJoin(providers, eq(reviews.providerId, providers.id))
    .where(eq(reviews.status, status))
    .orderBy(desc(reviews.createdAt))
    .limit(100);

  const statusLabel: Record<ReviewStatus, string> = {
    flagged: dict.backoffice.statusFlagged,
    published: dict.backoffice.statusApproved,
    removed: dict.backoffice.statusRemoved,
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-white">{dict.backoffice.navReviews}</h1>
      </div>

      <SectionTabs basePath="/control-room/reviews" active={status} tabs={STATUSES.map((value) => ({ value, label: statusLabel[value] }))} />

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-slate-900 p-4 text-sm text-slate-400">{dict.backoffice.noReviewsFound}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((review) => (
            <li key={review.id} className="rounded-2xl border border-white/10 bg-slate-900 p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-white">{review.authorName}</p>
                <span className="shrink-0 text-xs text-amber-400">{"⭐".repeat(review.rating)}</span>
              </div>
              <p className="text-xs text-slate-400">{review.placeName ?? review.providerName}</p>
              {review.comment && <p className="mt-1 text-xs text-slate-300">{review.comment}</p>}
              <ReviewActions reviewId={review.id} status={review.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
