"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { Badge, Button, Card, Select, Textarea } from "@/components/ui/primitives";
import { EmptyState, InlineAlert, Skeleton } from "@/components/ui/feedback";
import { AddToTripButton } from "@/components/trips/AddToTripButton";

// The community exists to serve trips, so every post that names a place
// carries the same add-to-trip action used in Explore and on the map. What a
// traveller finds here lands in their plan through the one trip layer.

interface FeedPost {
  id: string;
  kind: string;
  body: string;
  city: string | null;
  country: string | null;
  createdAt: string;
  authorName: string;
  isMine: boolean;
  place: { id: string; name: string; city: string; country: string } | null;
}

const KINDS = ["moment", "tip", "place"] as const;

export function CommunityFeed() {
  const { dict } = useLocale();
  const { user } = useAuth();
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number]>("moment");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reported, setReported] = useState<Record<string, boolean>>({});

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

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/community/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? dict.common.somethingWentWrong);
        return;
      }
      setBody("");
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
          <form onSubmit={submit} className="space-y-3">
            <Select value={kind} onChange={(e) => setKind(e.target.value as (typeof KINDS)[number])} aria-label={dict.communityFeed.kind}>
              <option value="moment">{dict.communityFeed.kindMoment}</option>
              <option value="tip">{dict.communityFeed.kindTip}</option>
              <option value="place">{dict.communityFeed.kindPlace}</option>
            </Select>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              required
              minLength={2}
              maxLength={1000}
              placeholder={dict.communityFeed.placeholder}
              aria-label={dict.communityFeed.placeholder}
            />
            {error && <InlineAlert tone="error">{error}</InlineAlert>}
            <Button type="submit" size="sm" loading={busy}>
              {dict.communityFeed.share}
            </Button>
          </form>
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
              <Card className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-brand-950">{post.authorName}</p>
                    {post.city && (
                      <p className="text-xs text-slate-500">
                        {post.city}
                        {post.country ? ", " + post.country : ""}
                      </p>
                    )}
                  </div>
                  <Badge tone="sky">
                    {post.kind === "tip"
                      ? dict.communityFeed.kindTip
                      : post.kind === "place"
                        ? dict.communityFeed.kindPlace
                        : dict.communityFeed.kindMoment}
                  </Badge>
                </div>

                <p className="whitespace-pre-line text-sm text-slate-700">{post.body}</p>

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
