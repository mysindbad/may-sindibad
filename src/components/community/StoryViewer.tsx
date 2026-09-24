"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import type { Dictionary } from "@/i18n/dictionaries/en";
import type { Story, StoryGroup } from "./StoryTray";
import { EyeIcon, HeartIcon } from "./icons";

const MIN_DURATION_MS = 5000;
const MAX_DURATION_MS = 15000;
const DEFAULT_DURATION_MS = 6000;

// A caption reads at roughly three words a second - give a short caption the
// floor duration and a long one more time, rather than cutting either off or
// making every story wait as long as the longest one ever posted.
function durationFor(story: Story): number {
  const words = story.body.trim().split(/\s+/).filter(Boolean).length;
  const readingMs = (words / 3) * 1000 + 2000;
  return Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, readingMs));
}

const GRADIENTS = [
  "from-violet-600 via-purple-600 to-fuchsia-600",
  "from-sky-600 via-blue-600 to-indigo-600",
  "from-emerald-600 via-teal-600 to-cyan-600",
  "from-amber-500 via-orange-500 to-rose-500",
  "from-brand-800 via-brand-900 to-slate-900",
];

function gradientFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return GRADIENTS[hash % GRADIENTS.length];
}

function relativeLabel(createdAt: string, dict: Dictionary): string {
  const minutes = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
  if (minutes < 1) return dict.stories.justNow;
  if (minutes < 60) return `${minutes} ${dict.navigation.unitMin}`;
  return `${Math.floor(minutes / 60)} ${dict.navigation.unitHour}`;
}

export function StoryViewer({
  groups,
  startIndex,
  onClose,
  onSeen,
  onDeleted,
}: {
  groups: StoryGroup[];
  startIndex: number;
  onClose: () => void;
  onSeen: (id: string) => void;
  onDeleted: (id: string) => void;
}) {
  const { dict } = useLocale();
  const [groupIndex, setGroupIndex] = useState(startIndex);
  const [storyIndex, setStoryIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [likeOverrides, setLikeOverrides] = useState<Record<string, { likedByMe: boolean; likeCount: number }>>({});
  const [viewsOpen, setViewsOpen] = useState(false);
  const [viewsData, setViewsData] = useState<{ count: number; viewers: { name: string; avatarUrl: string | null; liked: boolean }[] } | null>(null);

  const group = groups[groupIndex];
  const story = group?.stories[storyIndex];
  const duration = useMemo(() => (story ? durationFor(story) : DEFAULT_DURATION_MS), [story]);
  const likeState = story ? (likeOverrides[story.id] ?? { likedByMe: story.likedByMe, likeCount: story.likeCount }) : null;

  const goNext = useCallback(() => {
    const current = groups[groupIndex];
    if (!current) return;
    setElapsed(0);
    if (storyIndex < current.stories.length - 1) {
      setStoryIndex((i) => i + 1);
    } else if (groupIndex < groups.length - 1) {
      setGroupIndex((i) => i + 1);
      setStoryIndex(0);
    } else {
      onClose();
    }
  }, [groups, groupIndex, storyIndex, onClose]);

  const goPrev = useCallback(() => {
    setElapsed(0);
    if (storyIndex > 0) {
      setStoryIndex((i) => i - 1);
      return;
    }
    if (groupIndex > 0) {
      setGroupIndex((i) => i - 1);
      setStoryIndex(groups[groupIndex - 1].stories.length - 1);
    }
  }, [groups, groupIndex, storyIndex]);

  // Lock background scroll while the viewer is open.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    if (story) onSeen(story.id);
  }, [story, onSeen]);

  // A story only ever records a view from someone other than its own author
  // (the API enforces this too, but skipping the call for your own stories
  // avoids a pointless request every time you open your own tray).
  useEffect(() => {
    if (!story || group?.isMine) return;
    fetch(`/api/community/stories/${story.id}/view`, { method: "POST" }).catch(() => {});
  }, [story, group?.isMine]);

  // Close any open "who viewed this" list when moving to a different story,
  // and for your own story, load the count eagerly (cheap, and only ever
  // queried for your own content) so it's visible without having to tap
  // first - tapping the indicator just expands the list underneath it.
  useEffect(() => {
    setViewsOpen(false);
    setViewsData(null);
    if (!story || !group?.isMine) return;
    fetch(`/api/community/stories/${story.id}/views`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setViewsData(data);
      })
      .catch(() => {});
  }, [story, group?.isMine]);

  // Accumulate time for the current story via rAF so a press-and-hold pause
  // can resume from exactly where it left off, instead of restarting.
  useEffect(() => {
    if (paused || !story) return;
    let raf = 0;
    let last: number | null = null;
    function tick(ts: number) {
      if (last === null) last = ts;
      const delta = ts - last;
      last = ts;
      setElapsed((prev) => prev + delta);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, story]);

  useEffect(() => {
    if (elapsed >= duration) goNext();
  }, [elapsed, duration, goNext]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") goNext();
      if (event.key === "ArrowLeft") goPrev();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, goNext, goPrev]);

  if (!group || !story) return null;

  async function handleDelete() {
    if (!story || !window.confirm(dict.communityFeed.removeConfirm)) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/community/posts/" + story.id, { method: "DELETE" });
      if (res.ok) {
        onDeleted(story.id);
        onClose();
      }
    } finally {
      setDeleting(false);
    }
  }

  async function toggleLike() {
    if (!story || !likeState) return;
    const storyId = story.id;
    const next = { likedByMe: !likeState.likedByMe, likeCount: likeState.likeCount + (!likeState.likedByMe ? 1 : -1) };
    setLikeOverrides((prev) => ({ ...prev, [storyId]: next }));
    try {
      const res = await fetch(`/api/community/posts/${storyId}/like`, { method: next.likedByMe ? "POST" : "DELETE" });
      if (!res.ok) throw new Error("like failed");
      const data = (await res.json()) as { liked?: boolean; likeCount?: number };
      setLikeOverrides((prev) => ({ ...prev, [storyId]: { likedByMe: data.liked ?? next.likedByMe, likeCount: data.likeCount ?? next.likeCount } }));
    } catch {
      setLikeOverrides((prev) => ({ ...prev, [storyId]: likeState }));
    }
  }

  function toggleViews() {
    setViewsOpen((open) => !open);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95">
      <div
        className="safe-top safe-bottom relative flex h-dvh w-full max-w-md flex-col overflow-hidden sm:h-[92vh] sm:rounded-2xl"
        onPointerDown={() => setPaused(true)}
        onPointerUp={() => setPaused(false)}
        onPointerLeave={() => setPaused(false)}
      >
        <div className="absolute inset-0">
          {story.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote uploads come from arbitrary S3/local hosts, not the local image loader's fixed domain list.
            <img src={story.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className={`h-full w-full bg-gradient-to-br ${gradientFor(story.id)}`} />
          )}
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/60 to-transparent" />
        {story.imageUrl && (story.title || story.body) && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/70 to-transparent" />
        )}

        <button type="button" aria-label={dict.common.back} onClick={goPrev} className="absolute inset-y-0 left-0 z-10 w-1/3" />
        <button type="button" aria-label={dict.common.next} onClick={goNext} className="absolute inset-y-0 right-0 z-10 w-2/3" />

        <div className="relative z-20 flex gap-1 px-2 pt-2">
          {group.stories.map((s, i) => (
            <div key={s.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/30">
              <div
                className="h-full rounded-full bg-white"
                style={{ width: `${i < storyIndex ? 100 : i > storyIndex ? 0 : (elapsed / duration) * 100}%` }}
              />
            </div>
          ))}
        </div>

        <div className="relative z-20 flex items-center justify-between px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            {group.authorAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- remote avatar comes from arbitrary S3/local hosts, not the local image loader's fixed domain list.
              <img src={group.authorAvatarUrl} alt="" className="h-8 w-8 rounded-full object-cover ring-1 ring-white/40" />
            ) : (
              <span className="grid h-8 w-8 place-items-center rounded-full bg-white/20 text-xs font-semibold text-white">
                {group.authorName.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="truncate text-sm font-semibold text-white">{group.authorName}</span>
            <span className="shrink-0 text-xs text-white/70">· {relativeLabel(story.createdAt, dict)}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {group.isMine && (
              <button
                type="button"
                aria-label={dict.common.delete}
                disabled={deleting}
                onClick={(event) => {
                  event.stopPropagation();
                  void handleDelete();
                }}
                className="grid h-8 w-8 place-items-center rounded-full text-white/90 hover:bg-white/10 disabled:opacity-50"
              >
                🗑
              </button>
            )}
            <button
              type="button"
              aria-label={dict.common.close}
              onClick={(event) => {
                event.stopPropagation();
                onClose();
              }}
              className="grid h-8 w-8 place-items-center rounded-full text-lg text-white/90 hover:bg-white/10"
            >
              ✕
            </button>
          </div>
        </div>

        {/* pointer-events-none: this caption sits above the tap-to-advance
            zones z-index-wise, but has nothing interactive in it, so taps
            must fall through to them rather than land on the text block's
            own (much larger than its visible text) bounding box. */}
        {story.imageUrl ? (
          (story.title || story.body) && (
            <div className="pointer-events-none relative z-20 mt-auto space-y-1 px-4 pt-6">
              {story.title && <h3 className="text-lg font-semibold text-white">{story.title}</h3>}
              <p className="whitespace-pre-line text-sm leading-relaxed text-white/95">{story.body}</p>
            </div>
          )
        ) : (
          <div className="pointer-events-none relative z-20 flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            {story.title && <h3 className="text-2xl font-bold text-white">{story.title}</h3>}
            <p className="whitespace-pre-line text-lg font-medium leading-relaxed text-white">{story.body}</p>
          </div>
        )}

        {/* Interaction row: the owner sees how many people watched (tap to
            expand who); everyone else can react with a like, the same
            reaction the regular feed already has. mt-auto guarantees this
            sticks to the bottom whether or not a caption rendered above it. */}
        <div className={`relative z-20 flex items-end justify-between gap-3 px-4 pb-6 ${story.imageUrl && (story.title || story.body) ? "pt-3" : "mt-auto pt-6"}`}>
          {group.isMine ? (
            <div className="flex flex-col items-start gap-2">
              {viewsOpen && (
                <div className="max-h-40 w-56 overflow-y-auto rounded-2xl bg-black/60 p-3 backdrop-blur-sm" onClick={(event) => event.stopPropagation()}>
                  <p className="mb-2 text-xs font-semibold text-white/80">{dict.stories.viewedBy}</p>
                  {viewsData === null && <p className="text-xs text-white/60">{dict.common.loading}</p>}
                  {viewsData?.viewers.length === 0 && <p className="text-xs text-white/60">{dict.stories.noViewers}</p>}
                  {viewsData && viewsData.viewers.length > 0 && (
                    <ul className="space-y-2">
                      {viewsData.viewers.map((v, i) => (
                        <li key={i} className="flex items-center gap-2">
                          {v.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element -- remote avatar comes from arbitrary S3/local hosts, not the local image loader's fixed domain list.
                            <img src={v.avatarUrl} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
                          ) : (
                            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/20 text-[10px] font-semibold text-white">
                              {v.name.slice(0, 1).toUpperCase()}
                            </span>
                          )}
                          <span className="truncate text-sm text-white">{v.name}</span>
                          {v.liked && <HeartIcon filled className="h-3.5 w-3.5 shrink-0 text-rose-500" />}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  toggleViews();
                }}
                className="flex items-center gap-1.5 rounded-full bg-black/30 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm"
              >
                <EyeIcon className="h-4 w-4" />
                {viewsData ? viewsData.count : ""}
              </button>
            </div>
          ) : (
            <span />
          )}

          {!group.isMine && likeState && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void toggleLike();
              }}
              className={`flex items-center gap-1.5 rounded-full bg-black/30 px-3 py-1.5 text-sm font-medium backdrop-blur-sm ${likeState.likedByMe ? "text-rose-500" : "text-white"}`}
            >
              <HeartIcon filled={likeState.likedByMe} className="h-5 w-5" />
              {likeState.likeCount > 0 && likeState.likeCount}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
