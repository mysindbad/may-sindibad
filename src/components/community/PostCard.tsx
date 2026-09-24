"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useLocale } from "@/i18n/LocaleProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { AddToTripButton } from "@/components/trips/AddToTripButton";
import { formatDateRange, formatRelativeTime } from "@/lib/utils";
import { BriefcaseIcon, CloseIcon, CommentIcon, HeartIcon, MoreIcon, PinIcon, SendIcon, ShareIcon } from "./icons";

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

// A trip or place attached to a post is a real, actionable thing - not a
// clause in a sentence - so it gets the same compact icon-tile treatment
// Explore and the trip list already use, rather than a run-on line of text.
function AttachmentCard({ icon, tone, title, subtitle, action }: { icon: ReactNode; tone: "sky" | "emerald"; title: string; subtitle: string; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 dark:border-white/10 dark:bg-white/[0.04]">
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${
          tone === "sky" ? "bg-sky-500/10 text-sky-700 dark:text-sky-300" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
        }`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-brand-950 dark:text-sand-50">{title}</p>
        <p className="truncate text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
      </div>
      {action}
    </div>
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

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

  const kindLabel = post.kind === "tip" ? dict.communityFeed.kindTip : post.kind === "place" ? dict.communityFeed.kindPlace : null;
  const canManage = post.isMine || (!post.isMine && !!user);

  return (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-[var(--shadow-card)] dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex items-start justify-between gap-2 p-4 pb-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar name={post.authorName} url={post.authorAvatarUrl} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-brand-950 dark:text-sand-50">{post.authorName}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {formatRelativeTime(post.createdAt, locale)}
              {kindLabel && <> · {kindLabel}</>}
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

        {canManage && (
          <div className="relative shrink-0">
            <button
              type="button"
              aria-label={dict.communityFeed.moreOptions}
              onClick={() => setMenuOpen((open) => !open)}
              className="grid h-8 w-8 place-items-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-white/10 dark:hover:text-slate-300"
            >
              <MoreIcon className="h-5 w-5" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-50" onClick={() => setMenuOpen(false)} />
                <div className="absolute end-0 z-50 mt-1 w-40 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-[var(--shadow-elevated)] dark:border-white/10 dark:bg-brand-900">
                  {post.isMine ? (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onDelete(post.id);
                      }}
                      className="block w-full px-3 py-2 text-start text-sm text-rose-600 hover:bg-slate-50 dark:text-rose-400 dark:hover:bg-white/5"
                    >
                      {dict.common.delete}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={reported}
                      onClick={() => {
                        setMenuOpen(false);
                        onReport(post.id);
                      }}
                      className="block w-full px-3 py-2 text-start text-sm text-brand-950 hover:bg-slate-50 disabled:opacity-50 dark:text-sand-50 dark:hover:bg-white/5"
                    >
                      {reported ? dict.community.reportSent : dict.community.report}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Tapping the content itself opens the full view, like any real feed -
          every interactive control (like/comment/share, add-to-trip, the
          overflow menu) lives outside this link so it never fights it for taps. */}
      <Link href={`/${locale}/community/${post.id}`} className="block space-y-2 px-4 pb-2 transition-colors hover:bg-slate-50/70 dark:hover:bg-white/[0.02]">
        {post.title && <p className="text-base font-semibold text-brand-950 dark:text-sand-50">{post.title}</p>}
        <p className="whitespace-pre-line text-sm text-slate-700 dark:text-slate-300">{post.body}</p>

        {post.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- remote uploads come from arbitrary S3/local hosts, not the local image loader's fixed domain list.
          <img
            src={post.imageUrl}
            alt=""
            className="-mx-4 h-56 w-[calc(100%+2rem)] cursor-zoom-in object-cover"
            onClick={(event) => {
              // A photo is worth seeing full-size, like Facebook/Instagram -
              // stop the tap from also being read as "open the permalink".
              event.preventDefault();
              event.stopPropagation();
              setLightboxOpen(true);
            }}
          />
        )}

        {post.trip && (
          <AttachmentCard
            icon={<BriefcaseIcon className="h-5 w-5" />}
            tone="sky"
            title={post.trip.title}
            subtitle={`${post.trip.destinationCity}, ${post.trip.destinationCountry} · ${formatDateRange(post.trip.startDate, post.trip.endDate, locale)}`}
          />
        )}
      </Link>

      <div className="space-y-2 px-4 pb-4">
        {post.place && (
          <AttachmentCard
            icon={<PinIcon className="h-5 w-5" />}
            tone="emerald"
            title={post.place.name}
            subtitle={`${post.place.city}, ${post.place.country}`}
            action={<AddToTripButton placeId={post.place.id} />}
          />
        )}

        <div className="grid grid-cols-3 border-t border-slate-100 dark:border-white/5">
          <button
            type="button"
            disabled={!user}
            onClick={() => onLike(post)}
            className={`flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors ${
              post.likedByMe ? "text-rose-600 dark:text-rose-400" : "text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5"
            } ${!user ? "cursor-default" : "cursor-pointer"}`}
          >
            <HeartIcon filled={post.likedByMe} className="h-5 w-5" />
            <span>
              {dict.communityFeed.likeAction}
              {post.likeCount > 0 ? ` · ${post.likeCount}` : ""}
            </span>
          </button>

          <button
            type="button"
            onClick={toggleComments}
            className="flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5"
          >
            <CommentIcon className="h-5 w-5" />
            <span>
              {dict.communityFeed.commentAction}
              {post.commentCount > 0 ? ` · ${post.commentCount}` : ""}
            </span>
          </button>

          <div className="relative">
            <button
              type="button"
              disabled={shareBusy}
              onClick={() => setShareMenuOpen((open) => !open)}
              className="flex w-full items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-white/5"
            >
              <ShareIcon className="h-5 w-5" />
              <span>{dict.communityFeed.shareAction}</span>
            </button>
            {shareMenuOpen && (
              <>
                <div className="fixed inset-0 z-50" onClick={() => setShareMenuOpen(false)} />
                <div className="absolute end-0 z-50 mt-1 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-[var(--shadow-elevated)] dark:border-white/10 dark:bg-brand-900">
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
                      <CloseIcon className="h-3.5 w-3.5" />
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
                  className="shrink-0 text-sky-600 disabled:opacity-40 dark:text-sky-400"
                >
                  <SendIcon className="h-5 w-5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {lightboxOpen && post.imageUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4" onClick={() => setLightboxOpen(false)}>
          <button
            type="button"
            aria-label={dict.common.close}
            onClick={() => setLightboxOpen(false)}
            className="absolute end-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element -- remote uploads come from arbitrary S3/local hosts, not the local image loader's fixed domain list. */}
          <img src={post.imageUrl} alt="" className="max-h-full max-w-full object-contain" onClick={(event) => event.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
