"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import { Button, Textarea } from "@/components/ui/primitives";
import { InlineAlert } from "@/components/ui/feedback";

export function AddStoryModal({ onClose, onPosted }: { onClose: () => void; onPosted: () => void }) {
  const { dict } = useLocale();
  const [body, setBody] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        body: JSON.stringify({ kind: "story", body }),
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
          <h2 className="text-base font-semibold text-brand-950 dark:text-sand-50">{dict.stories.addStory}</h2>
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
          {photoPreview && (
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
          )}

          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            required
            minLength={2}
            maxLength={4000}
            autoFocus
            placeholder={dict.stories.placeholder}
            aria-label={dict.stories.placeholder}
          />

          {!photoPreview && (
            <div>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" id="story-photo-input" />
              <label
                htmlFor="story-photo-input"
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-white/20 dark:text-slate-300 dark:hover:bg-white/5"
              >
                📷 {dict.communityFeed.addPhoto}
              </label>
            </div>
          )}

          {error && <InlineAlert tone="error">{error}</InlineAlert>}

          <Button type="submit" loading={busy} fullWidth className="mt-auto">
            {dict.communityFeed.share}
          </Button>
        </form>
      </div>
    </div>
  );
}
