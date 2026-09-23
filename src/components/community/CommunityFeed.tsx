"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { Badge, Button, Card, Select, Textarea } from "@/components/ui/primitives";
import { EmptyState, InlineAlert, Skeleton } from "@/components/ui/feedback";
import { AddToTripButton } from "@/components/trips/AddToTripButton";

// The community exists to serve trips, so every post that names a place
// carries the same add-to-trip action used in Explore and on the map. What a
// traveller finds here lands in their plan through the one trip layer.
// A post can also showcase one of the traveller's own trips (destination and
// dates only, never the itinerary itself, which stays private) and a photo,
// so this feels like a real travel feed rather than a text-only guestbook.

interface FeedPost {
  id: string;
  kind: string;
  title: string | null;
  body: string;
  city: string | null;
  country: string | null;
  createdAt: string;
  authorName: string;
  isMine: boolean;
  imageUrl: string | null;
  place: { id: string; name: string; city: string; country: string } | null;
  trip: { title: string; destinationCity: string; destinationCountry: string; startDate: string; endDate: string } | null;
}

interface MyTrip {
  id: string;
  title: string;
  destinationCity: string;
  destinationCountry: string;
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
        body: JSON.stringify({ kind, body, tripId: tripId || undefined }),
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
              <Card className="space-y-2 overflow-hidden p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-brand-950 dark:text-sand-50">{post.authorName}</p>
                    {post.city && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {post.city}
                        {post.country ? ", " + post.country : ""}
                      </p>
                    )}
                  </div>
                  <Badge tone="sky">
                    {post.kind === "tip" ? dict.communityFeed.kindTip : post.kind === "place" ? dict.communityFeed.kindPlace : dict.communityFeed.kindMoment}
                  </Badge>
                </div>

                {post.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- remote uploads come from arbitrary S3/local hosts, not the local image loader's fixed domain list.
                  <img src={post.imageUrl} alt="" className="-mx-4 h-48 w-[calc(100%+2rem)] object-cover" />
                )}

                <p className="whitespace-pre-line text-sm text-slate-700 dark:text-slate-300">{post.body}</p>

                {post.trip && (
                  <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-sky-500/5 px-3 py-2 text-xs font-medium text-brand-800">
                    <span aria-hidden="true">🧳</span>
                    {dict.communityFeed.sharedTrip}: {post.trip.title} — {post.trip.destinationCity}, {post.trip.destinationCountry} ·{" "}
                    {post.trip.startDate} → {post.trip.endDate}
                  </div>
                )}

                {post.place && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-xs font-medium text-brand-800">📍 {post.place.name}</span>
                    <AddToTripButton placeId={post.place.id} />
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  {post.isMine && (
                    <Button size="sm" variant="ghost" onClick={() => void removePost(post.id)}>
                      {dict.common.delete}
                    </Button>
                  )}
                  {!post.isMine && user && (
                    <Button size="sm" variant="ghost" disabled={reported[post.id]} onClick={() => void report(post.id)}>
                      {reported[post.id] ? dict.community.reportSent : dict.community.report}
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
