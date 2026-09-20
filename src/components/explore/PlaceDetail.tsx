"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/i18n/LocaleProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { Badge, Button, Textarea } from "@/components/ui/primitives";
import { InlineAlert } from "@/components/ui/feedback";
import { placeTrustLabel } from "@/components/places/trust";
import type { PlaceCardData } from "@/components/places/PlaceCard";
import { buildLoginPath } from "@/lib/auth/return-path";

interface ReviewRow {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  userName: string;
}

export function PlaceDetail({ place, reviews }: { place: PlaceCardData & { address?: string | null }; reviews: ReviewRow[] }) {
  const { dict, locale } = useLocale();
  const { user } = useAuth();
  const router = useRouter();
  const loginPath = buildLoginPath(locale, `/${locale}/explore/${place.id}`);

  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [localReviews, setLocalReviews] = useState(reviews);
  const [favorited, setFavorited] = useState(false);
  const [favBusy, setFavBusy] = useState(false);
  const [reportSent, setReportSent] = useState(false);

  async function submitReview() {
    if (!user) {
      router.push(loginPath);
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: place.id, rating, comment: comment || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.push(loginPath);
        return;
      }
      if (!res.ok) {
        setFeedback({ tone: "error", text: data.error ?? dict.common.somethingWentWrong });
        return;
      }
      setLocalReviews((prev) => [{ id: data.review.id, rating, comment, createdAt: new Date().toISOString(), userName: user.name }, ...prev]);
      setComment("");
      setFeedback({ tone: "success", text: dict.settings.saved });
    } catch {
      setFeedback({ tone: "error", text: dict.errors.network });
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleFavorite() {
    if (!user) {
      router.push(loginPath);
      return;
    }
    setFavBusy(true);
    try {
      const res = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType: "place", targetId: place.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.push(loginPath);
        return;
      }
      if (res.ok) setFavorited(data.favorited);
    } finally {
      setFavBusy(false);
    }
  }

  async function sendReport() {
    if (!user) {
      router.push(loginPath);
      return;
    }
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetType: "place", targetId: place.id, reason: "inaccurate" }),
    });
    if (res.status === 401) {
      router.push(loginPath);
      return;
    }
    if (res.ok) setReportSent(true);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div aria-hidden="true" className="flex h-40 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-800 to-sky-500 text-5xl text-white">📍</div>
      <div className="mt-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-brand-950">{place.name}</h1>
          <p className="text-sm text-slate-500">
            {place.address ? `${place.address} · ` : ""}
            {place.city}, {place.country}
          </p>
        </div>
        <Button
          variant={favorited ? "primary" : "secondary"}
          size="sm"
          loading={favBusy}
          onClick={toggleFavorite}
          aria-label={dict.home.savedTitle}
          aria-pressed={favorited}
        >
          <span aria-hidden="true">{favorited ? "♥" : "♡"}</span>
        </Button>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <Badge tone="brand">{placeTrustLabel(place.sourceType, dict)}</Badge>
        {place.ratingCount > 0 && <Badge tone="sun">★ {place.ratingAverage.toFixed(1)} ({place.ratingCount})</Badge>}
      </div>

      {place.description && <p className="mt-4 text-sm leading-relaxed text-slate-700">{place.description}</p>}

      <div className="mt-6 flex gap-2">
        <Button variant="ghost" size="sm" onClick={sendReport} disabled={reportSent}>
          <span aria-hidden="true">🚩</span> {reportSent ? dict.community.reportSent : dict.community.report}
        </Button>
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-base font-semibold text-brand-950">{dict.explore.reviews}</h2>

        <div className="mb-5 rounded-2xl border border-slate-200 p-4">
          <div className="mb-2 flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button key={star} type="button" onClick={() => setRating(star)} aria-label={`${star}/5`} aria-pressed={rating === star}>
                <span aria-hidden="true" className={star <= rating ? "text-amber-500" : "text-slate-300"}>★</span>
              </button>
            ))}
          </div>
          <Textarea rows={2} placeholder={dict.explore.reviewPlaceholder} value={comment} onChange={(e) => setComment(e.target.value)} />
          {feedback && (
            <div className="mt-2">
              <InlineAlert tone={feedback.tone}>{feedback.text}</InlineAlert>
            </div>
          )}
          <div className="mt-2 flex justify-end">
            <Button size="sm" loading={submitting} onClick={submitReview}>
              {dict.common.save}
            </Button>
          </div>
        </div>

        <ul className="space-y-3">
          {localReviews.map((review) => (
            <li key={review.id} className="rounded-xl bg-white p-3 shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-brand-950">{review.userName}</p>
                <span className="text-xs text-amber-500">{"★".repeat(review.rating)}</span>
              </div>
              {review.comment && <p className="mt-1 text-sm text-slate-600">{review.comment}</p>}
            </li>
          ))}
          {localReviews.length === 0 && <p className="text-sm text-slate-500">{dict.explore.noReviews}</p>}
        </ul>
      </section>

      <p className="mt-8 text-xs text-slate-400">{dict.community.trustNotice}</p>
    </div>
  );
}
