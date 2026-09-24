"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card } from "@/components/ui/primitives";
import { EmptyState, InlineAlert, Skeleton } from "@/components/ui/feedback";
import { PostCard, type FeedPost } from "./PostCard";
import { PostComposerModal } from "./PostComposerModal";
import { CameraIcon } from "./icons";

// The community exists to serve trips, so every post that names a place
// carries the same add-to-trip action used in Explore and on the map. What a
// traveller finds here lands in their plan through the one trip layer.
// A post can also showcase one of the traveller's own trips (destination and
// dates only, never the itinerary itself, which stays private) and a photo,
// so this feels like a real travel feed rather than a text-only guestbook.

export function CommunityFeed() {
  const { dict } = useLocale();
  const { user } = useAuth();
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [reported, setReported] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

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

  function handlePosted() {
    setComposerOpen(false);
    void load();
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
        <Card className="p-3">
          <button type="button" onClick={() => setComposerOpen(true)} className="flex w-full items-center gap-3 text-start">
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- remote avatar comes from arbitrary S3/local hosts, not the local image loader's fixed domain list.
              <img src={user.avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-800 text-sm font-semibold text-white">
                {user.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="flex-1 truncate rounded-full bg-slate-100 px-4 py-2.5 text-sm text-slate-500 dark:bg-white/5 dark:text-slate-400">
              {dict.communityFeed.placeholder}
            </span>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400">
              <CameraIcon className="h-5 w-5" />
            </span>
          </button>
        </Card>
      ) : (
        <InlineAlert tone="info">{dict.communityFeed.signInToPost}</InlineAlert>
      )}

      {error && <InlineAlert tone="error">{error}</InlineAlert>}

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

      {composerOpen && <PostComposerModal onClose={() => setComposerOpen(false)} onPosted={handlePosted} />}
    </div>
  );
}
