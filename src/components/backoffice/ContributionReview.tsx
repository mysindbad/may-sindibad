"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { osmViewUrl } from "@/lib/domain/review-summary";
import { locateReason } from "./places/strings";
import { reviewText } from "./review-strings";

type Coordinates = { lat: number; lng: number };

/**
 * Decision card for one pending contribution. A community "new place" arrives
 * with name, city, country and a description but NO coordinates, while
 * approving it creates a live place and the API refuses to without verified
 * coordinates - so the reviewer supplies and confirms them here, on the same
 * screen, before the approve button can be used.
 */
export function ContributionReview({
  contributionId,
  type,
  supported,
  submittedCoordinates,
}: {
  contributionId: string;
  type: string;
  /** The API can apply an approval of this contribution type. */
  supported: boolean;
  submittedCoordinates: Coordinates | null;
}) {
  const router = useRouter();
  const needsCoordinates = type === "new_place";

  const [pasted, setPasted] = useState("");
  const [locating, setLocating] = useState(false);
  const [entered, setEntered] = useState<(Coordinates & { precision: string }) | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Coordinates the reviewer typed override whatever the contributor sent.
  const coordinates: Coordinates | null = entered ?? submittedCoordinates;
  const coordinatesReady = coordinates !== null && (entered === null || confirmed);
  const canApprove = supported && (!needsCoordinates || coordinatesReady);

  async function locate() {
    setLocating(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/places/locate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: pasted }),
      });
      if (res.status === 401) return router.push("/control-room/login");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(locateReason[data.reason] ?? reviewText.failed);
        return;
      }
      setEntered({ lat: data.location.lat, lng: data.location.lng, precision: data.location.precision });
      setConfirmed(false);
    } catch {
      setError(reviewText.network);
    } finally {
      setLocating(false);
    }
  }

  async function decide(status: "approved" | "rejected") {
    setBusy(status);
    setError(null);
    try {
      const res = await fetch("/api/admin/contributions/" + contributionId, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          ...(note.trim() ? { reviewNote: note.trim() } : {}),
          ...(status === "approved" && entered ? { coordinates: { lat: entered.lat, lng: entered.lng } } : {}),
        }),
      });
      if (res.status === 401) return router.push("/control-room/login");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data.error as string | undefined) ?? reviewText.failed);
        return;
      }
      router.refresh();
    } catch {
      setError(reviewText.network);
    } finally {
      setBusy(null);
    }
  }

  const input =
    "w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-sky-500/40";

  return (
    <div className="mt-3 space-y-3 border-t border-white/10 pt-3">
      {needsCoordinates && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-300">{reviewText.coordinatesTitle}</p>
          {submittedCoordinates && (
            <p className="text-xs text-slate-400">
              {reviewText.coordinatesFromContribution}:{" "}
              <span dir="ltr">
                {submittedCoordinates.lat}, {submittedCoordinates.lng}
              </span>{" "}
              <a href={osmViewUrl(submittedCoordinates.lat, submittedCoordinates.lng)} target="_blank" rel="noopener noreferrer" className="text-sky-300 underline">
                {reviewText.viewOsm}
              </a>
            </p>
          )}
          {!coordinates && <p className="text-xs text-amber-300">{reviewText.coordinatesMissing}</p>}
          <div className="flex gap-2">
            <input
              dir="ltr"
              className={input}
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder="https://www.google.com/maps/… / 31.6295, -7.9811"
              aria-label={reviewText.pasteLabel}
            />
            <button
              type="button"
              onClick={() => void locate()}
              disabled={locating || pasted.trim() === ""}
              className="shrink-0 rounded-lg bg-sky-500/20 px-3 text-xs font-medium text-sky-200 hover:bg-sky-500/30 disabled:opacity-50"
            >
              {locating ? reviewText.extracting : reviewText.extract}
            </button>
          </div>
          {entered && (
            <div className="space-y-1.5 text-xs text-slate-300">
              <p>
                {reviewText.coordinatesVerified}:{" "}
                <span dir="ltr">
                  {entered.lat}, {entered.lng}
                </span>
              </p>
              {entered.precision === "viewport" && <p className="text-amber-300">{reviewText.viewportWarning}</p>}
              <a href={osmViewUrl(entered.lat, entered.lng)} target="_blank" rel="noopener noreferrer" className="inline-block text-sky-300 underline">
                {reviewText.viewOsm}
              </a>
              <label className="flex cursor-pointer items-center gap-2 text-slate-200">
                <input type="checkbox" className="h-4 w-4 accent-sky-500" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                {reviewText.confirmCoordinates}
              </label>
            </div>
          )}
        </div>
      )}

      <textarea
        rows={2}
        maxLength={2000}
        className={input}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={reviewText.note}
        aria-label={reviewText.note}
      />

      {!supported && <p className="text-xs text-slate-400">{reviewText.unsupportedType}</p>}
      {supported && needsCoordinates && !canApprove && <p className="text-xs text-slate-400">{reviewText.approveNeedsCoordinates}</p>}
      {canApprove && <p className="text-xs text-slate-500">{reviewText.approveWarning}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void decide("approved")}
          disabled={!canApprove || busy !== null}
          className="rounded-lg bg-sky-500/20 px-3 py-1.5 text-xs font-medium text-sky-300 hover:bg-sky-500/30 disabled:opacity-40"
        >
          {busy === "approved" ? "…" : reviewText.approve}
        </button>
        <button
          type="button"
          onClick={() => void decide("rejected")}
          disabled={busy !== null}
          className="rounded-lg bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/25 disabled:opacity-40"
        >
          {busy === "rejected" ? "…" : reviewText.reject}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-rose-400">
          {error}
        </p>
      )}
    </div>
  );
}
