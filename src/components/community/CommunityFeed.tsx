"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button, Card, Select, Textarea } from "@/components/ui/primitives";
import { EmptyState, InlineAlert, Skeleton } from "@/components/ui/feedback";
import { PostCard, type FeedPost } from "./PostCard";

// The community exists to serve trips, so every post that names a place
// carries the same add-to-trip action used in Explore and on the map. What a
// traveller finds here lands in their plan through the one trip layer.
// A post can also showcase one of the traveller's own trips (destination and
// dates only, never the itinerary itself, which stays private) and a photo,
// so this feels like a real travel feed rather than a text-only guestbook.

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

const KINDS = ["moment", "tip", "place"] as const;

export function CommunityFeed() {
  const { dict } = useLocale();
  const { user } = useAuth();
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number]>("moment");
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
  const [reported, setReported] = useState<Record<string, boolean>>({});
  // Collapsed to a single row until the traveller means to post - the full
  // form (kind, photo, trip) sitting open at all times is what made the
  // composer and the feed below it read as one dissolved block.
  const [composerOpen, setComposerOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/community/posts");
      const data = (await res.json()) as { posts?: FeedPost[] };
      setPosts(data.posts ?? []);
    } catch {
      setPosts([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!user) return;
    fetch("/api/trips")
      .then((res) => res.json())
      .then((data: { trips?: MyTrip[] }) => setMyTrips(data.trips ?? []))
      .catch(() => {});
  }, [user]);

  // A "place" post exists to point at somewhere real, so picking one has to
  // search the actual directory - not just leave it as a text label with no
  // location behind it.
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

  function clearPlace() {
    setSelectedPlace(null);
    setPlaceQuery("");
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
        }
      }

      setBody("");
      setTripId("");
      clearPhoto();
      clearPlace();
      setKind("moment");
      setComposerOpen(false);
      await load();
    } catch {
      setError(dict.errors.network);
    } finally {
      setBusy(false);
    }
  }

  async function removePost(id: string) {
    if (!window.confirm(dict.communityFeed.removeConfirm)) return;
    try {
      const res = await fetch("/api/community/posts/" + id, { method: "DELETE" });
      if (res.ok) await load();
    } catch {
      setError(dict.errors.network);
    }
  }

  async function toggleLike(post: FeedPost) {
    if (!user) return;
    const nextLiked = !post.likedByMe;
    // Optimistic: a like should feel instant, and the unique constraint on
    // the server makes the eventual request idempotent either way.
    setPosts((prev) =>
      (prev ?? []).map((p) => (p.id === post.id ? { ...p, likedByMe: nextLiked, likeCount: p.likeCount + (nextLiked ? 1 : -1) } : p)),
    );
    try {
      const res = await fetch(`/api/community/posts/${post.id}/like`, { method: nextLiked ? "POST" : "DELETE" });
      if (!res.ok) throw new Error("like failed");
      const data = (await res.json()) as { likeCount?: number; liked?: boolean };
      setPosts((prev) =>
        (prev ?? []).map((p) => (p.id === post.id ? { ...p, likeCount: data.likeCount ?? p.likeCount, likedByMe: data.liked ?? p.likedByMe } : p)),
      );
    } catch {
      // Roll back - the count shown must always match what the server has.
      setPosts((prev) =>
        (prev ?? []).map((p) => (p.id === post.id ? { ...p, likedByMe: post.likedByMe, likeCount: post.likeCount } : p)),
      );
    }
  }

  async function report(id: string) {
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType: "community_post", targetId: id, reason: "offensive" }),
      });
      // 409 means this traveller already reported it, which for them is the
      // same outcome: it is with moderation.
      if (res.ok || res.status === 409) setReported((prev) => ({ ...prev, [id]: true }));
    } catch {
      setError(dict.errors.network);
    }
  }

  return (
    <div className="space-y-5">
      {user ? (
        <Card className="p-4">
          {composerOpen ? (
            <form onSubmit={submit} className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Select value={kind} onChange={(e) => setKind(e.target.value as (typeof KINDS)[number])} aria-label={dict.communityFeed.kind}>
                  <option value="moment">{dict.communityFeed.kindMoment}</option>
                  <option value="tip">{dict.communityFeed.kindTip}</option>
                  <option value="place">{dict.communityFeed.kindPlace}</option>
                </Select>
                <button
                  type="button"
                  onClick={() => setComposerOpen(false)}
                  aria-label={dict.common.cancel}
                  className="shrink-0 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
                >
                  ✕
                </button>
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
                      onClick={clearPlace}
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
                rows={3}
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
                  <div className="relative inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview before upload, not a remote image */}
                    <img src={photoPreview} alt="" className="h-24 w-24 rounded-xl object-cover" />
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
              <Button type="submit" size="sm" loading={busy}>
                {dict.communityFeed.share}
              </Button>
            </form>
          ) : (
            <button type="button" onClick={() => setComposerOpen(true)} className="flex w-full items-center gap-3 text-start">
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- remote avatar comes from arbitrary S3/local hosts, not the local image loader's fixed domain list.
                <img src={user.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-800 text-sm font-semibold text-white">
                  {user.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="flex-1 truncate rounded-full bg-slate-100 px-4 py-2.5 text-sm text-slate-500 dark:bg-white/5 dark:text-slate-400">
                {dict.communityFeed.placeholder}
              </span>
              <span className="shrink-0 text-lg" aria-hidden="true">
                📷
              </span>
            </button>
          )}
        </Card>
      ) : (
        <InlineAlert tone="info">{dict.communityFeed.signInToPost}</InlineAlert>
      )}

      {posts === null && (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {posts !== null && posts.length === 0 && (
        <EmptyState icon="🧳" title={dict.communityFeed.empty} body={dict.communityFeed.emptyBody} />
      )}

      {posts !== null && posts.length > 0 && (
        <ul className="space-y-3">
          {posts.map((post) => (
            <li key={post.id}>
              <PostCard post={post} onLike={(p) => void toggleLike(p)} onDelete={(id) => void removePost(id)} onReport={(id) => void report(id)} reported={!!reported[post.id]} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
