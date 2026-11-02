"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlaceCard } from "@/components/places/PlaceCard";
import { PlaceImage } from "@/components/places/PlaceImage";
import { blockerLabel, imageReason, locateReason, placeText, priceLabels } from "./strings";

const PlacePinMap = dynamic(() => import("./PlacePinMap").then((m) => m.PlacePinMap), {
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse rounded-xl bg-white/5" />,
});

export type EditorStatus = "pending" | "approved" | "rejected" | "flagged";

export interface EditorPlace {
  id: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  city: string;
  country: string;
  address: string | null;
  lat: number;
  lng: number;
  priceLevel: number;
  coverImageUrl: string | null;
  status: EditorStatus;
}

export interface EditorCategory {
  id: string;
  slug: string;
  label: string;
}

type Notice = { tone: "success" | "error" | "info"; text: string } | null;

const INPUT =
  "w-full rounded-xl border border-white/10 bg-slate-950 px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-sky-500/40";
const LABEL = "mb-1.5 block text-xs font-medium text-slate-300";

function toNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function validCoordinates(lat: number | null, lng: number | null): lat is number {
  return lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
}

const STATUS_STYLE: Record<EditorStatus, { label: string; cls: string; explain: string }> = {
  pending: { label: placeText.statusDraft, cls: "bg-amber-500/15 text-amber-300", explain: placeText.draftExplain },
  approved: { label: placeText.statusPublished, cls: "bg-emerald-500/15 text-emerald-300", explain: placeText.publishedExplain },
  rejected: { label: placeText.statusArchived, cls: "bg-slate-500/20 text-slate-300", explain: placeText.archivedExplain },
  flagged: { label: placeText.statusReview, cls: "bg-rose-500/15 text-rose-300", explain: placeText.reviewExplain },
};

export function PlaceEditor({
  place,
  categories,
  uploadsEnabled,
  justCreated = false,
}: {
  place: EditorPlace | null;
  categories: EditorCategory[];
  uploadsEnabled: boolean;
  /** Arrived here straight after creating the draft. */
  justCreated?: boolean;
}) {
  const router = useRouter();
  const isNew = place === null;

  const [name, setName] = useState(place?.name ?? "");
  const [description, setDescription] = useState(place?.description ?? "");
  const [categoryId, setCategoryId] = useState(place?.categoryId ?? "");
  const [priceLevel, setPriceLevel] = useState(place?.priceLevel ?? 0);
  const [city, setCity] = useState(place?.city ?? "");
  const [country, setCountry] = useState(place?.country ?? "");
  const [address, setAddress] = useState(place?.address ?? "");
  const [latText, setLatText] = useState(place ? String(place.lat) : "");
  const [lngText, setLngText] = useState(place ? String(place.lng) : "");
  const [coverImageUrl, setCoverImageUrl] = useState(place?.coverImageUrl ?? "");

  const [pasted, setPasted] = useState("");
  const [locating, setLocating] = useState(false);
  // An existing saved location counts as already confirmed; any change (new
  // place, pasted link, dragged pin, typed numbers) must be confirmed again.
  const [locationConfirmed, setLocationConfirmed] = useState(!isNew);
  const [locationNotice, setLocationNotice] = useState<Notice>(null);

  const [imageUrlInput, setImageUrlInput] = useState("");
  const [imageChecking, setImageChecking] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageNotice, setImageNotice] = useState<Notice>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(justCreated ? { tone: "success", text: placeText.saved } : null);
  const [duplicate, setDuplicate] = useState<{ id: string; name: string; status: string } | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const lat = toNumber(latText);
  const lng = toNumber(lngText);
  const hasValidPoint = validCoordinates(lat, lng);
  const status: EditorStatus = place?.status ?? "pending";

  function setPoint(nextLat: number, nextLng: number) {
    setLatText(String(Math.round(nextLat * 1e6) / 1e6));
    setLngText(String(Math.round(nextLng * 1e6) / 1e6));
    setLocationConfirmed(false);
  }

  async function locate() {
    setLocating(true);
    setLocationNotice(null);
    try {
      const res = await fetch("/api/admin/places/locate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: pasted }),
      });
      if (res.status === 401) return router.push("/control-room/login");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLocationNotice({ tone: "error", text: locateReason[data.reason] ?? placeText.unexpectedError });
        return;
      }
      setLatText(String(data.location.lat));
      setLngText(String(data.location.lng));
      setLocationConfirmed(false);
      setLocationNotice({ tone: "info", text: data.location.precision === "viewport" ? placeText.precisionViewport : placeText.precisionPin });
    } catch {
      setLocationNotice({ tone: "error", text: placeText.networkError });
    } finally {
      setLocating(false);
    }
  }

  async function verifyImageUrl() {
    setImageChecking(true);
    setImageNotice(null);
    try {
      const res = await fetch("/api/admin/places/check-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: imageUrlInput.trim() }),
      });
      if (res.status === 401) return router.push("/control-room/login");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setImageNotice({ tone: "error", text: imageReason[data.reason] ?? placeText.unexpectedError });
        return;
      }
      setCoverImageUrl(imageUrlInput.trim());
      setImageNotice({ tone: "success", text: placeText.imageVerified });
    } catch {
      setImageNotice({ tone: "error", text: placeText.networkError });
    } finally {
      setImageChecking(false);
    }
  }

  async function uploadImage(file: File) {
    if (!place) return;
    setImageUploading(true);
    setImageNotice(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("ownerType", "place");
      form.append("ownerId", place.id);
      const res = await fetch("/api/uploads", { method: "POST", body: form });
      if (res.status === 401) return router.push("/control-room/login");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const text =
          data.code === "storage_unavailable" ? placeText.uploadUnavailable : (data.error as string | undefined) ?? placeText.unexpectedError;
        setImageNotice({ tone: "error", text });
        return;
      }
      const url = data.media.url as string;
      // Link the new image to the place right away so it is never an orphan.
      const link = await fetch("/api/admin/places/" + place.id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverImageUrl: url }),
      });
      if (!link.ok) {
        setImageNotice({ tone: "error", text: placeText.unexpectedError });
        return;
      }
      setCoverImageUrl(url);
      setImageNotice({ tone: "success", text: placeText.uploaded });
      router.refresh();
    } catch {
      setImageNotice({ tone: "error", text: placeText.networkError });
    } finally {
      setImageUploading(false);
    }
  }

  /** Client-side checks that mirror the server rules, so the admin sees the problem next to the field. */
  function validate(): string | null {
    if (name.trim().length < 2) return placeText.fixName;
    if (!city.trim()) return placeText.fixCity;
    if (!country.trim()) return placeText.fixCountry;
    if (!hasValidPoint) return placeText.fixCoordinates;
    if (description.length > 4000) return placeText.fixDescriptionLength;
    if (!locationConfirmed) return placeText.confirmRequired;
    return null;
  }

  function fields() {
    return {
      name: name.trim(),
      description: description.trim() || null,
      categoryId: categoryId || null,
      city: city.trim(),
      country: country.trim(),
      address: address.trim() || null,
      lat: lat as number,
      lng: lng as number,
      priceLevel,
      coverImageUrl: coverImageUrl.trim() || null,
    };
  }

  async function submit(kind: "draft" | "publish" | "keep" | "archive" | "restore", allowDuplicate = false) {
    setNotice(null);
    setDuplicate(null);

    // Archiving / restoring is a status change only; it needs no valid form.
    const statusOnly = kind === "archive" || kind === "restore";
    if (!statusOnly) {
      const problem = validate();
      if (problem) {
        setNotice({ tone: "error", text: problem });
        return;
      }
    } else if (kind === "archive" && !window.confirm(placeText.confirmArchive)) {
      return;
    }

    const targetStatus =
      kind === "publish" ? "approved" : kind === "draft" || kind === "restore" ? "pending" : kind === "archive" ? "rejected" : undefined;

    setBusy(kind);
    try {
      const body = statusOnly ? { status: targetStatus } : { ...fields(), ...(targetStatus ? { status: targetStatus } : {}) };
      const res = await fetch(isNew ? "/api/admin/places" : "/api/admin/places/" + place.id, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isNew ? { ...body, status: targetStatus ?? "pending", ...(allowDuplicate ? { allowDuplicate: true } : {}) } : body),
      });
      if (res.status === 401) return router.push("/control-room/login");
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 403) setNotice({ tone: "error", text: placeText.forbidden });
        else if (data.code === "duplicate") setDuplicate(data.duplicate);
        else if (data.code === "incomplete") {
          const missing = (data.blockers as string[]).map((b) => blockerLabel[b] ?? b).join("، ");
          setNotice({ tone: "error", text: `${placeText.notCompleteToPublish} ${missing}` });
        } else if (data.code === "bad_cover_image") {
          setNotice({ tone: "error", text: imageReason[data.reason] ?? placeText.unexpectedError });
        } else setNotice({ tone: "error", text: placeText.unexpectedError });
        return;
      }

      const text = kind === "publish" ? placeText.savedPublished : kind === "archive" ? placeText.savedArchived : placeText.saved;
      if (isNew) {
        router.push(`/control-room/places/${data.place.id}?saved=1`);
        return;
      }
      setNotice({ tone: "success", text });
      router.refresh();
    } catch {
      setNotice({ tone: "error", text: placeText.networkError });
    } finally {
      setBusy(null);
    }
  }

  const chosenCategory = categories.find((c) => c.id === categoryId);
  const style = STATUS_STYLE[status];
  const disabled = busy !== null;
  const savedImageUrl = coverImageUrl.trim();

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-28">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/control-room/places" className="text-xs text-slate-400 hover:text-slate-200">
            ← {placeText.backToList}
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-white">{isNew ? placeText.newPlaceTitle : placeText.editPlaceTitle}</h1>
        </div>
        {!isNew && (
          <span className={"rounded-full px-3 py-1 text-xs font-medium " + style.cls}>{style.label}</span>
        )}
      </div>

      <p className="text-xs text-slate-400">{isNew ? placeText.draftExplain : style.explain}</p>
      {!isNew && status === "approved" && (
        <Link href={`/ar/explore/${place.id}`} target="_blank" className="inline-block text-xs text-sky-300 underline">
          {placeText.viewInApp}
        </Link>
      )}

      {duplicate && (
        <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          <p>
            {placeText.duplicateFound} <strong>{duplicate.name}</strong>
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href={`/control-room/places/${duplicate.id}`} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white">
              {placeText.edit}
            </Link>
            <button type="button" onClick={() => void submit("draft", true)} className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs text-amber-100">
              {placeText.createAnyway}
            </button>
          </div>
        </div>
      )}

      <Section title={placeText.sectionBasics}>
        <div>
          <label htmlFor="pl-name" className={LABEL}>
            {placeText.name}
          </label>
          <input id="pl-name" className={INPUT} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="pl-cat" className={LABEL}>
              {placeText.category}
            </label>
            <select id="pl-cat" className={INPUT} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">{placeText.chooseCategory}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="pl-price" className={LABEL}>
              {placeText.price}
            </label>
            <select id="pl-price" className={INPUT} value={priceLevel} onChange={(e) => setPriceLevel(Number(e.target.value))}>
              {priceLabels.map((label, index) => (
                <option key={label} value={index}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="pl-desc" className={LABEL}>
            {placeText.description}
          </label>
          <textarea id="pl-desc" rows={4} className={INPUT} value={description} onChange={(e) => setDescription(e.target.value)} />
          <p className="mt-1 flex justify-between text-[11px] text-slate-500">
            <span>{placeText.descriptionHint}</span>
            <span>{description.length}/4000</span>
          </p>
        </div>
      </Section>

      <Section title={placeText.sectionLocation}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="pl-city" className={LABEL}>
              {placeText.city}
            </label>
            <input id="pl-city" className={INPUT} value={city} onChange={(e) => setCity(e.target.value)} maxLength={120} />
          </div>
          <div>
            <label htmlFor="pl-country" className={LABEL}>
              {placeText.country}
            </label>
            <input id="pl-country" className={INPUT} value={country} onChange={(e) => setCountry(e.target.value)} maxLength={120} />
          </div>
        </div>
        <div>
          <label htmlFor="pl-address" className={LABEL}>
            {placeText.address}
          </label>
          <input id="pl-address" className={INPUT} value={address} onChange={(e) => setAddress(e.target.value)} maxLength={500} />
        </div>

        <div>
          <label htmlFor="pl-paste" className={LABEL}>
            {placeText.pasteLabel}
          </label>
          <div className="flex gap-2">
            <input
              id="pl-paste"
              dir="ltr"
              className={INPUT}
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder="https://www.google.com/maps/… أو 31.6295, -7.9811"
            />
            <button
              type="button"
              onClick={() => void locate()}
              disabled={locating || pasted.trim() === ""}
              className="shrink-0 rounded-xl bg-sky-500/20 px-4 text-xs font-medium text-sky-200 hover:bg-sky-500/30 disabled:opacity-50"
            >
              {locating ? placeText.extracting : placeText.extract}
            </button>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">{placeText.pasteHint}</p>
          {locationNotice && <div className="mt-2"><Banner notice={locationNotice} /></div>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="pl-lat" className={LABEL}>
              {placeText.lat}
            </label>
            <input
              id="pl-lat"
              dir="ltr"
              inputMode="decimal"
              className={INPUT}
              value={latText}
              onChange={(e) => {
                setLatText(e.target.value);
                setLocationConfirmed(false);
              }}
            />
          </div>
          <div>
            <label htmlFor="pl-lng" className={LABEL}>
              {placeText.lng}
            </label>
            <input
              id="pl-lng"
              dir="ltr"
              inputMode="decimal"
              className={INPUT}
              value={lngText}
              onChange={(e) => {
                setLngText(e.target.value);
                setLocationConfirmed(false);
              }}
            />
          </div>
        </div>

        <PlacePinMap lat={hasValidPoint ? lat : null} lng={hasValidPoint ? toNumber(lngText) : null} onChange={setPoint} />

        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-200">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-sky-500"
            checked={locationConfirmed}
            disabled={!hasValidPoint}
            onChange={(e) => setLocationConfirmed(e.target.checked)}
          />
          <span>{placeText.confirmLocation}</span>
        </label>
      </Section>

      <Section title={placeText.sectionImages}>
        <p className="text-xs text-slate-400">{placeText.imageHint}</p>

        {savedImageUrl && (
          <div className="space-y-2">
            <div className="overflow-hidden rounded-xl border border-white/10 bg-slate-950">
              <PlaceImage
                key={savedImageUrl}
                src={savedImageUrl}
                className="h-48 w-full object-cover"
                fallback={<p className="p-4 text-xs text-rose-300">{placeText.imageLoadFailed}</p>}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setCoverImageUrl("");
                setImageNotice(null);
              }}
              className="text-xs text-rose-300 underline"
            >
              {placeText.removeImage}
            </button>
          </div>
        )}

        <div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-white/5 px-4 py-2.5 text-xs font-medium text-slate-200 hover:bg-white/10 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={isNew || !uploadsEnabled || imageUploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
                  setImageNotice({ tone: "error", text: imageReason.not_image });
                  return;
                }
                if (file.size > 5 * 1024 * 1024) {
                  setImageNotice({ tone: "error", text: imageReason.too_large });
                  return;
                }
                void uploadImage(file);
              }}
            />
            {imageUploading ? placeText.uploading : placeText.upload}
          </label>
          {isNew && <p className="mt-1 text-[11px] text-slate-500">{placeText.uploadNeedsSave}</p>}
          {!isNew && !uploadsEnabled && <p className="mt-1 text-[11px] text-amber-300">{placeText.uploadUnavailable}</p>}
        </div>

        <div>
          <label htmlFor="pl-img-url" className={LABEL}>
            {placeText.orUrl}
          </label>
          <div className="flex gap-2">
            <input
              id="pl-img-url"
              dir="ltr"
              className={INPUT}
              value={imageUrlInput}
              onChange={(e) => setImageUrlInput(e.target.value)}
              placeholder="https://…/photo.jpg"
            />
            <button
              type="button"
              onClick={() => void verifyImageUrl()}
              disabled={imageChecking || imageUrlInput.trim() === ""}
              className="shrink-0 rounded-xl bg-sky-500/20 px-4 text-xs font-medium text-sky-200 hover:bg-sky-500/30 disabled:opacity-50"
            >
              {imageChecking ? placeText.verifying : placeText.verifyImage}
            </button>
          </div>
        </div>
        {imageNotice && <Banner notice={imageNotice} />}
      </Section>

      {showPreview && (
        <Section title={placeText.preview}>
          <p className="text-xs text-slate-400">{placeText.previewNote}</p>
          <div className="pointer-events-none mx-auto max-w-xs" aria-hidden="true">
            <PlaceCard
              locale="ar"
              trustLabel={placeText.statusPublished}
              place={{
                id: place?.id ?? "preview",
                name: name.trim() || "—",
                description: description.trim() || null,
                city: city.trim() || "—",
                country: country.trim(),
                priceLevel,
                ratingAverage: 0,
                ratingCount: 0,
                sourceType: "verified",
                coverImageUrl: savedImageUrl || null,
                category: chosenCategory?.slug ?? null,
              }}
            />
          </div>
          {description.trim() && <p className="text-sm leading-relaxed text-slate-300">{description.trim()}</p>}
        </Section>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-slate-900/95 p-3 backdrop-blur md:start-64">
        {notice && (
          <div className="mx-auto mb-2 max-w-3xl">
            <Banner notice={notice} />
          </div>
        )}
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2">
          <ActionButton onClick={() => setShowPreview((v) => !v)} disabled={disabled}>
            {showPreview ? placeText.hidePreview : placeText.preview}
          </ActionButton>
          {status === "rejected" && !isNew ? (
            <ActionButton tone="primary" onClick={() => void submit("restore")} disabled={disabled} busy={busy === "restore"}>
              {placeText.restore}
            </ActionButton>
          ) : (
            <>
              {isNew || status === "pending" ? (
                <ActionButton onClick={() => void submit("draft")} disabled={disabled} busy={busy === "draft"}>
                  {isNew ? placeText.saveDraft : placeText.saveChanges}
                </ActionButton>
              ) : (
                <ActionButton onClick={() => void submit("keep")} disabled={disabled} busy={busy === "keep"}>
                  {placeText.saveChanges}
                </ActionButton>
              )}
              {(isNew || status === "pending" || status === "flagged") && (
                <ActionButton tone="primary" onClick={() => void submit("publish")} disabled={disabled} busy={busy === "publish"}>
                  {isNew ? placeText.publish : placeText.publishChanges}
                </ActionButton>
              )}
              {!isNew && status === "approved" && (
                <ActionButton onClick={() => void submit("draft")} disabled={disabled} busy={busy === "draft"}>
                  {placeText.unpublish}
                </ActionButton>
              )}
              {!isNew && (
                <ActionButton tone="danger" onClick={() => void submit("archive")} disabled={disabled} busy={busy === "archive"}>
                  {placeText.archive}
                </ActionButton>
              )}
            </>
          )}
          {busy && <span className="text-xs text-slate-400">{placeText.saving}</span>}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-slate-900 p-4 md:p-5">
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      {children}
    </section>
  );
}

function Banner({ notice }: { notice: NonNullable<Notice> }) {
  const cls =
    notice.tone === "success"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      : notice.tone === "error"
        ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
        : "border-sky-500/30 bg-sky-500/10 text-sky-200";
  return (
    <div role={notice.tone === "error" ? "alert" : "status"} className={"rounded-xl border p-3 text-sm " + cls}>
      {notice.text}
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  busy,
  tone = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  busy?: boolean;
  tone?: "default" | "primary" | "danger";
}) {
  const cls =
    tone === "primary"
      ? "bg-sky-500 text-white hover:bg-sky-400"
      : tone === "danger"
        ? "bg-rose-500/15 text-rose-300 hover:bg-rose-500/25"
        : "bg-white/10 text-slate-100 hover:bg-white/15";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={"rounded-xl px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50 " + cls}
    >
      {busy ? "…" : children}
    </button>
  );
}
