"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button, Select, Textarea } from "@/components/ui/primitives";
import { InlineAlert } from "@/components/ui/feedback";

interface MyTrip {
  id: string;
  title: string;
  destinationCity: string;
  destinationCountry: string;
}

interface PlaceOption {
  id: string;
  name: string;
  city: string;
  country: string;
  coverImageUrl: string | null;
}

const KINDS = [
  { value: "moment", icon: "📷", labelKey: "kindMoment" },
  { value: "tip", icon: "💡", labelKey: "kindTip" },
  { value: "place", icon: "📍", labelKey: "kindPlace" },
] as const;

export function PostComposerModal({ onClose, onPosted }: { onClose: () => void; onPosted: () => void }) {
  const { dict } = useLocale();
  const { user } = useAuth();
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("moment");
  const [body, setBody] = useState("");
  const [myTrips, setMyTrips] = useState<MyTrip[]>([]);
  const [tripId, setTripId] = useState("");
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<PlaceOption[]>([]);
  const [placeSearching, setPlaceSearching] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<PlaceOption | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/trips")
      .then((res) => res.json())
      .then((data: { trips?: MyTrip[] }) => setMyTrips(data.trips ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (kind !== "place" || selectedPlace || placeQuery.trim().length < 2) {
      setPlaceResults([]);
      return;
    }
    let cancelled = false;
    setPlaceSearching(true);
    const timer = setTimeout(() => {
      fetch(`/api/places?q=${encodeURIComponent(placeQuery.trim())}&limit=6`)
        .then((res) => res.json())
        .then((data: { places?: PlaceOption[] }) => {
          if (!cancelled) setPlaceResults(data.places ?? []);
        })
        .catch(() => {
          if (!cancelled) setPlaceResults([]);
        })
        .finally(() => {
          if (!cancelled) setPlaceSearching(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [kind, placeQuery, selectedPlace]);

  function pickPlace(place: PlaceOption) {
    setSelectedPlace(place);
    setPlaceQuery("");
    setPlaceResults([]);
  }

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setPhotoFile(file);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
  }

  function clearPhoto() {
    setPhotoFile(null);
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/community/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, body, tripId: tripId || undefined, placeId: selectedPlace?.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? dict.common.somethingWentWrong);
        return;
      }

      if (photoFile) {
        const form = new FormData();
        form.append("file", photoFile);
        form.append("ownerType", "community_post");
        form.append("ownerId", data.post.id);
        const uploadRes = await fetch("/api/uploads", { method: "POST", body: form });
        if (!uploadRes.ok) {
          const uploadData = await uploadRes.json().catch(() => ({}));
          setError(uploadData.error ?? dict.common.somethingWentWrong);
          return;
        }
      }

      onPosted();
    } catch {
      setError(dict.errors.network);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="safe-top safe-bottom flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white dark:bg-brand-900">
        <div className="flex items-center justify-between border-b border-brand-900/8 px-4 py-3 dark:border-white/10">
          <h2 className="text-base font-semibold text-brand-950 dark:text-sand-50">{dict.communityFeed.title}</h2>
          <button
            type="button"
            aria-label={dict.common.close}
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10"
          >
            ✕
          </button>
        </div>

        <form onSubmit={submit} className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
          <div className="flex items-center gap-2">
            {user?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- remote avatar comes from arbitrary S3/local hosts, not the local image loader's fixed domain list.
              <img src={user.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-800 text-sm font-semibold text-white">
                {user?.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <p className="text-sm font-semibold text-brand-950 dark:text-sand-50">{user?.name}</p>
          </div>

          <div className="flex gap-2">
            {KINDS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setKind(option.value)}
                className={`flex flex-1 flex-col items-center gap-1 rounded-xl border px-2 py-2 text-xs font-medium transition-colors ${
                  kind === option.value
                    ? "border-sky-500 bg-sky-500/10 text-sky-700 dark:text-sky-300"
                    : "border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5"
                }`}
              >
                <span className="text-base">{option.icon}</span>
                {dict.communityFeed[option.labelKey]}
              </button>
            ))}
          </div>

          {kind === "place" &&
            (selectedPlace ? (
              <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-2 dark:bg-white/5">
                {selectedPlace.coverImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- remote place photos come from arbitrary S3/local hosts, not the local image loader's fixed domain list.
                  <img src={selectedPlace.coverImageUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-800 text-white">📍</span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-brand-950 dark:text-sand-50">{selectedPlace.name}</p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {selectedPlace.city}, {selectedPlace.country}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPlace(null)}
                  aria-label={dict.common.cancel}
                  className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={placeQuery}
                  onChange={(e) => setPlaceQuery(e.target.value)}
                  placeholder={dict.explore.searchPlaceholder}
                  aria-label={dict.explore.searchPlaceholder}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-brand-950 outline-none focus:ring-2 focus:ring-sky-500/40 dark:border-white/15 dark:bg-white/5 dark:text-sand-50"
                />
                {placeSearching && <p className="mt-1 text-xs text-slate-400">{dict.common.loading}</p>}
                {placeResults.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full space-y-0.5 rounded-xl border border-slate-200 bg-white p-1 shadow-[var(--shadow-elevated)] dark:border-white/10 dark:bg-brand-900">
                    {placeResults.map((place) => (
                      <li key={place.id}>
                        <button
                          type="button"
                          onClick={() => pickPlace(place)}
                          className="flex w-full items-center gap-2 rounded-lg p-1.5 text-start hover:bg-slate-50 dark:hover:bg-white/5"
                        >
                          {place.coverImageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element -- remote place photos come from arbitrary S3/local hosts, not the local image loader's fixed domain list.
                            <img src={place.coverImageUrl} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" />
                          ) : (
                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-brand-800 text-xs text-white">📍</span>
                          )}
                          <span className="min-w-0">
                            <span className="block truncate text-sm text-brand-950 dark:text-sand-50">{place.name}</span>
                            <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                              {place.city}, {place.country}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}

          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            required
            minLength={2}
            maxLength={4000}
            placeholder={dict.communityFeed.placeholder}
            aria-label={dict.communityFeed.placeholder}
            autoFocus
          />

          {myTrips.length > 0 && (
            <Select value={tripId} onChange={(e) => setTripId(e.target.value)} aria-label={dict.communityFeed.attachTrip}>
              <option value="">{dict.communityFeed.noTripOption}</option>
              {myTrips.map((trip) => (
                <option key={trip.id} value={trip.id}>
                  {trip.title} — {trip.destinationCity}
                </option>
              ))}
            </Select>
          )}

          <div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" id="community-photo-input" />
            {photoPreview ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview before upload, not a remote image */}
                <img src={photoPreview} alt="" className="h-48 w-full rounded-xl object-cover" />
                <button
                  type="button"
                  onClick={clearPhoto}
                  aria-label={dict.communityFeed.removePhoto}
                  className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-brand-950 text-xs text-white shadow-[var(--shadow-card)]"
                >
                  ✕
                </button>
              </div>
            ) : (
              <label
                htmlFor="community-photo-input"
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-white/20 dark:text-slate-300 dark:hover:bg-white/5"
              >
                📷 {dict.communityFeed.addPhoto}
              </label>
            )}
          </div>

          {error && <InlineAlert tone="error">{error}</InlineAlert>}
          <Button type="submit" loading={busy} fullWidth className="mt-auto">
            {dict.communityFeed.share}
          </Button>
        </form>
      </div>
    </div>
  );
}
