"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/feedback";
import { StoryViewer } from "./StoryViewer";
import { AddStoryModal } from "./AddStoryModal";

export interface Story {
  id: string;
  title: string | null;
  body: string;
  imageUrl: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface StoryGroup {
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  isMine: boolean;
  stories: Story[];
}

interface ActiveViewer {
  groups: StoryGroup[];
  startIndex: number;
}

const SEEN_STORAGE_KEY = "sindbad_seen_stories";

function readSeenIds(): Set<string> {
  try {
    const raw = window.localStorage.getItem(SEEN_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function writeSeenIds(ids: Set<string>) {
  try {
    window.localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Private browsing or blocked storage - the unseen ring just resets next visit.
  }
}

const RING_ACTIVE = "ring-sky-500";
const RING_IDLE = "ring-slate-200 dark:ring-white/15";
const AVATAR_RING = "h-16 w-16 rounded-full object-cover ring-2 ring-offset-2 ring-offset-sand-50 dark:ring-offset-brand-950";

export function StoryTray() {
  const { dict } = useLocale();
  const { user } = useAuth();
  const [groups, setGroups] = useState<StoryGroup[] | null>(null);
  const [seenIds, setSeenIds] = useState<Set<string>>(() => (typeof window === "undefined" ? new Set() : readSeenIds()));
  const [activeViewer, setActiveViewer] = useState<ActiveViewer | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/community/stories");
      const data = (await res.json()) as { groups?: StoryGroup[] };
      setGroups(data.groups ?? []);
    } catch {
      setGroups([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Garbage-collect seen-ids for stories that are no longer active (expired
  // or deleted) so localStorage never grows without bound.
  useEffect(() => {
    if (!groups) return;
    const activeIds = new Set(groups.flatMap((g) => g.stories.map((s) => s.id)));
    setSeenIds((prev) => {
      const pruned = new Set([...prev].filter((id) => activeIds.has(id)));
      return pruned.size === prev.size ? prev : pruned;
    });
  }, [groups]);

  useEffect(() => {
    writeSeenIds(seenIds);
  }, [seenIds]);

  const markSeen = useCallback((id: string) => {
    setSeenIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  const orderedGroups = useMemo(() => {
    if (!groups) return [];
    const mine = groups.filter((g) => g.isMine);
    const others = groups.filter((g) => !g.isMine);
    const unseen = others.filter((g) => g.stories.some((s) => !seenIds.has(s.id)));
    const seen = others.filter((g) => g.stories.every((s) => seenIds.has(s.id)));
    return [...mine, ...unseen, ...seen];
  }, [groups, seenIds]);

  const myGroup = orderedGroups.find((g) => g.isMine) ?? null;
  const otherGroups = orderedGroups.filter((g) => !g.isMine);

  function openViewer(group: StoryGroup) {
    const startIndex = orderedGroups.indexOf(group);
    setActiveViewer({ groups: orderedGroups, startIndex });
  }

  function handlePosted() {
    setComposerOpen(false);
    void load();
  }

  function handleDeleted(storyId: string) {
    setGroups((prev) =>
      (prev ?? []).map((g) => ({ ...g, stories: g.stories.filter((s) => s.id !== storyId) })).filter((g) => g.stories.length > 0),
    );
  }

  if (groups === null) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-16 w-16 shrink-0 rounded-full" />
        ))}
      </div>
    );
  }

  if (orderedGroups.length === 0 && !user) return null;

  return (
    <div className="scrollbar-none flex gap-4 overflow-x-auto pb-1">
      {user && (
        <button
          type="button"
          onClick={() => (myGroup ? openViewer(myGroup) : setComposerOpen(true))}
          className="flex w-16 shrink-0 flex-col items-center gap-1.5"
        >
          <span className="relative block h-16 w-16">
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- remote avatar comes from arbitrary S3/local hosts, not the local image loader's fixed domain list.
              <img src={user.avatarUrl} alt="" className={cn(AVATAR_RING, myGroup ? RING_ACTIVE : RING_IDLE)} />
            ) : (
              <span className={cn("grid h-16 w-16 place-items-center rounded-full bg-brand-800 text-lg font-semibold text-white ring-2 ring-offset-2 ring-offset-sand-50 dark:ring-offset-brand-950", myGroup ? RING_ACTIVE : RING_IDLE)}>
                {user.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span
              role="button"
              tabIndex={0}
              aria-label={dict.stories.addStory}
              onClick={(event) => {
                event.stopPropagation();
                setComposerOpen(true);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                event.stopPropagation();
                setComposerOpen(true);
              }}
              className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full bg-sky-600 text-xs font-bold leading-none text-white ring-2 ring-sand-50 dark:ring-brand-950"
            >
              +
            </span>
          </span>
          <span className="max-w-16 truncate text-[11px] font-medium text-brand-950 dark:text-sand-50">{dict.stories.yourStory}</span>
        </button>
      )}

      {otherGroups.map((group) => {
        const hasUnseen = group.stories.some((s) => !seenIds.has(s.id));
        return (
          <button key={group.authorId} type="button" onClick={() => openViewer(group)} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
            {group.authorAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- remote avatar comes from arbitrary S3/local hosts, not the local image loader's fixed domain list.
              <img src={group.authorAvatarUrl} alt="" className={cn(AVATAR_RING, hasUnseen ? RING_ACTIVE : RING_IDLE)} />
            ) : (
              <span className={cn("grid h-16 w-16 place-items-center rounded-full bg-brand-800 text-lg font-semibold text-white ring-2 ring-offset-2 ring-offset-sand-50 dark:ring-offset-brand-950", hasUnseen ? RING_ACTIVE : RING_IDLE)}>
                {group.authorName.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="max-w-16 truncate text-[11px] font-medium text-brand-950 dark:text-sand-50">{group.authorName}</span>
          </button>
        );
      })}

      {activeViewer && (
        <StoryViewer
          groups={activeViewer.groups}
          startIndex={activeViewer.startIndex}
          onClose={() => setActiveViewer(null)}
          onSeen={markSeen}
          onDeleted={handleDeleted}
        />
      )}

      {composerOpen && <AddStoryModal onClose={() => setComposerOpen(false)} onPosted={handlePosted} />}
    </div>
  );
}
