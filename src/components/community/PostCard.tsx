"use client";

import { useState } from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { Badge, Button } from "@/components/ui/primitives";
import { AddToTripButton } from "@/components/trips/AddToTripButton";
import { formatRelativeTime } from "@/lib/utils";

export interface FeedPost {
  id: string;
  kind: string;
  title: string | null;
  body: string;
  city: string | null;
  country: string | null;
  createdAt: string;
  authorName: string;
  authorAvatarUrl: string | null;
  isMine: boolean;
  imageUrl: string | null;
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
  place: { id: string; name: string; city: string; country: string } | null;
  trip: { title: string; destinationCity: string; destinationCountry: string; startDate: string; endDate: string } | null;
}

interface Comment {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
}

function Avatar({ name, url, className = "h-9 w-9 text-sm" }: { name: string; url: string | null; className?: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element -- remote avatar comes from arbitrary S3/local hosts, not the local image loader's fixed domain list.
    return <img src={url} alt="" className={`shrink-0 rounded-full object-cover ${className}`} />;
  }
  return (
    <span className={`grid shrink-0 place-items-center rounded-full bg-brand-800 font-semibold text-white ${className}`}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function PostCard({
  post,
  onLike,
  onDelete,
  onReport,
  reported,
}: {
  post: FeedPost;
  onLike: (post: FeedPost) => void;
  onDelete: (id: string) => void;
  onReport: (id: string) => void;
  reported: boolean;
}) {
  const { dict, locale } = useLocale();
  const { user } = useAuth();
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  async function loadComments() {
    if (comments !== null) return;
    try {
      const res = await fetch(`/api/community/posts/${post.id}/comments`);
      const data = (await res.json()) as { comments?: Comment[] };
      // Merge rather than replace: if a comment was posted optimistically
      // while this fetch was still in flight, a plain overwrite here would
      // erase it, since this GET was sent before that comment existed.
      setComments((prev) => {
        const fetched = data.comments ?? [];
        if (prev === null || prev.length === 0) return fetched;
        const byId = new Map(fetched.map((c) => [c.id, c] as const));
        for (const c of prev) byId.set(c.id, c);
        return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      });
    } catch {
      setComments((prev) => prev ?? []);
    }
  }

  function toggleComments() {
    const next = !commentsOpen;
    setCommentsOpen(next);
    if (next) void loadComments();
  }

  async function submitComment() {
    const body = commentDraft.trim();
    if (!body || commentBusy) return;
    setCommentBusy(true);
    try {
      const res = await fetch(`/api/community/posts/${post.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = (await res.json()) as { comment?: Comment };
      if (res.ok && data.comment) {
        setComments((prev) => [...(prev ?? []), data.comment as Comment]);
        setCommentDraft("");
      }
    } finally {
      setCommentBusy(false);
    }
  }

  async function removeComment(commentId: string) {
    if (!window.confirm(dict.communityFeed.deleteCommentConfirm)) return;
    const res = await fetch(`/api/community/posts/${post.id}/comments/${commentId}`, { method: "DELETE" });
    if (res.ok) setComments((prev) => (prev ?? []).filter((c) => c.id !== commentId));
  }

  function flashFeedback(message: string) {
    setShareFeedback(message);
    setTimeout(() => setShareFeedback(null), 2500);
  }

  async function shareExternally() {
    setShareMenuOpen(false);
    const url = `${window.location.origin}/${locale}/community/${post.id}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: post.authorName, text: post.title ?? post.body.slice(0, 140), url });
      } catch {
        // The traveller cancelled the share sheet - not worth surfacing as an error.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      flashFeedback(dict.communityFeed.linkCopied);
    } catch {
      // Clipboard access denied - nothing more we can do without a manual copy field.
    }
  }

  async function shareAsStory() {
    setShareMenuOpen(false);
    setShareBusy(true);
    try {
      const res = await fetch("/api/community/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "story", body: post.body }),
      });
      if (res.ok) flashFeedback(dict.communityFeed.sharedAsStory);
    } finally {
      setShareBusy(false);
    }
  }

  return (
    <div className="space-y-2 overflow-hidden rounded-2xl border border-slate-100 bg-white p-4 shadow-[var(--shadow-card)] dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar name={post.authorName} url={post.authorAvatarUrl} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-brand-950 dark:text-sand-50">{post.authorName}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {formatRelativeTime(post.createdAt, locale)}
              {post.city && (
                <>
                  {" · "}
                  {post.city}
                  {post.country ? ", " + post.country : ""}
                </>
              )}
            </p>
          </div>
        </div>
        <Badge tone="sky">
          {post.kind === "tip" ? dict.communityFeed.kindTip : post.kind === "place" ? dict.communityFeed.kindPlace : dict.communityFeed.kindMoment}
        </Badge>
      </div>

      {post.title && <p className="text-base font-semibold text-brand-950 dark:text-sand-50">{post.title}</p>}
      <p className="whitespace-pre-line text-sm text-slate-700 dark:text-slate-300">{post.body}</p>

      {post.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- remote uploads come from arbitrary S3/local hosts, not the local image loader's fixed domain list.
        <img src={post.imageUrl} alt="" className="-mx-4 h-56 w-[calc(100%+2rem)] object-cover" />
      )}

      {post.trip && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-sky-500/5 px-3 py-2 text-xs font-medium text-brand-800">
          <span aria-hidden="true">🧳</span>
          {dict.communityFeed.sharedTrip}: {post.trip.title} — {post.trip.destinationCity}, {post.trip.destinationCountry} · {post.trip.startDate} →{" "}
          {post.trip.endDate}
        </div>
      )}

      {post.place && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs font-medium text-brand-800">📍 {post.place.name}</span>
          <AddToTripButton placeId={post.place.id} />
        </div>
      )}

      <div className="flex items-center gap-1 border-t border-slate-100 pt-2 dark:border-white/5">
        <button
          type="button"
          disabled={!user}
          onClick={() => onLike(post)}
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-medium transition-colors ${
            post.likedByMe ? "text-rose-600 dark:text-rose-400" : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5"
          } ${!user ? "cursor-default" : "cursor-pointer"}`}
        >
          <span aria-hidden="true">{post.likedByMe ? "❤️" : "🤍"}</span>
          {post.likeCount > 0 && <span>{post.likeCount}</span>}
        </button>

        <button
          type="button"
          onClick={toggleComments}
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5"
        >
          <span aria-hidden="true">💬</span>
          {post.commentCount > 0 && <span>{post.commentCount}</span>}
        </button>

        <div className="relative ms-auto">
          <button
            type="button"
            disabled={shareBusy}
            onClick={() => setShareMenuOpen((open) => !open)}
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-white/5"
          >
            <span aria-hidden="true">↗️</span>
            {dict.communityFeed.shareAction}
          </button>
          {shareMenuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShareMenuOpen(false)} />
              <div className="absolute end-0 z-20 mt-1 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-[var(--shadow-elevated)] dark:border-white/10 dark:bg-brand-900">
                <button
                  type="button"
                  onClick={() => void shareExternally()}
                  className="block w-full px-3 py-2 text-start text-sm text-brand-950 hover:bg-slate-50 dark:text-sand-50 dark:hover:bg-white/5"
                >
                  {dict.communityFeed.shareAction}
                </button>
                {user && (
                  <button
                    type="button"
                    onClick={() => void shareAsStory()}
                    className="block w-full px-3 py-2 text-start text-sm text-brand-950 hover:bg-slate-50 dark:text-sand-50 dark:hover:bg-white/5"
                  >
                    {dict.communityFeed.shareToStory}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {shareFeedback && <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{shareFeedback}</p>}

      {commentsOpen && (
        <div className="space-y-2.5 border-t border-slate-100 pt-2.5 dark:border-white/5">
          {comments === null && <p className="text-xs text-slate-400">{dict.common.loading}</p>}
          {comments !== null && comments.length === 0 && <p className="text-xs text-slate-500 dark:text-slate-400">{dict.communityFeed.noComments}</p>}
          {comments !== null &&
            comments.map((comment) => (
              <div key={comment.id} className="flex items-start gap-2">
                <Avatar name={comment.authorName} url={comment.authorAvatarUrl} className="h-7 w-7 text-xs" />
                <div className="min-w-0 flex-1 rounded-2xl bg-slate-50 px-3 py-1.5 dark:bg-white/5">
                  <p className="text-xs font-semibold text-brand-950 dark:text-sand-50">{comment.authorName}</p>
                  <p className="whitespace-pre-line text-sm text-slate-700 dark:text-slate-300">{comment.body}</p>
                </div>
                {user && (user.id === comment.authorId || user.role === "admin") && (
                  <button
                    type="button"
                    onClick={() => void removeComment(comment.id)}
                    aria-label={dict.common.delete}
                    className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}

          {user && (
            <div className="flex items-center gap-2 pt-1">
              <Avatar name={user.name} url={user.avatarUrl} className="h-7 w-7 text-xs" />
              <input
                type="text"
                value={commentDraft}
                onChange={(event) => setCommentDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void submitComment();
                }}
                maxLength={1000}
                placeholder={dict.communityFeed.commentPlaceholder}
                className="min-w-0 flex-1 rounded-full bg-slate-100 px-3.5 py-1.5 text-sm text-brand-950 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-sky-500/40 dark:bg-white/5 dark:text-sand-50"
              />
              <button
                type="button"
                disabled={commentBusy || !commentDraft.trim()}
                onClick={() => void submitComment()}
                aria-label={dict.communityFeed.commentPlaceholder}
                className="shrink-0 text-lg text-sky-600 disabled:opacity-40"
              >
                ➤
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {post.isMine && (
          <Button size="sm" variant="ghost" onClick={() => onDelete(post.id)}>
            {dict.common.delete}
          </Button>
        )}
        {!post.isMine && user && (
          <Button size="sm" variant="ghost" disabled={reported} onClick={() => onReport(post.id)}>
            {reported ? dict.community.reportSent : dict.community.report}
          </Button>
        )}
      </div>
    </div>
  );
}
