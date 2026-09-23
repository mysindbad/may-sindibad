"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/i18n/LocaleProvider";
import { PostCard, type FeedPost } from "./PostCard";

// The permalink a share button points at - one post, rendered through the
// same <PostCard> the feed uses, with its own small copies of the feed's
// like/delete/report handlers since there is no shared post list here to
// update optimistically against.
export function SinglePostView({ initialPost }: { initialPost: FeedPost }) {
  const { dict, locale } = useLocale();
  const router = useRouter();
  const [post, setPost] = useState(initialPost);
  const [reported, setReported] = useState(false);

  async function toggleLike() {
    const nextLiked = !post.likedByMe;
    setPost((prev) => ({ ...prev, likedByMe: nextLiked, likeCount: prev.likeCount + (nextLiked ? 1 : -1) }));
    try {
      const res = await fetch(`/api/community/posts/${post.id}/like`, { method: nextLiked ? "POST" : "DELETE" });
      if (!res.ok) throw new Error("like failed");
      const data = (await res.json()) as { likeCount?: number; liked?: boolean };
      setPost((prev) => ({ ...prev, likeCount: data.likeCount ?? prev.likeCount, likedByMe: data.liked ?? prev.likedByMe }));
    } catch {
      setPost((prev) => ({ ...prev, likedByMe: !nextLiked, likeCount: prev.likeCount + (nextLiked ? -1 : 1) }));
    }
  }

  async function removePost() {
    if (!window.confirm(dict.communityFeed.removeConfirm)) return;
    const res = await fetch(`/api/community/posts/${post.id}`, { method: "DELETE" });
    if (res.ok) router.push(`/${locale}/community`);
  }

  async function report() {
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType: "community_post", targetId: post.id, reason: "offensive" }),
      });
      if (res.ok || res.status === 409) setReported(true);
    } catch {
      // Best-effort - the report button staying enabled just lets them try again.
    }
  }

  return <PostCard post={post} onLike={() => void toggleLike()} onDelete={() => void removePost()} onReport={() => void report()} reported={reported} />;
}
