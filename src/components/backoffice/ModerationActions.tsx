"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/i18n/LocaleProvider";

function useModerationAction(endpoint: string, method: "PATCH" | "DELETE" = "PATCH") {
  const { dict } = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, body?: Record<string, unknown>) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status === 401) {
        router.push("/control-room/login");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? dict.common.somethingWentWrong);
        return;
      }
      router.refresh();
    } catch {
      setError(dict.errors.network);
    } finally {
      setBusy(null);
    }
  }

  return { run, busy, error };
}

function ActionRow({ children, error }: { children: ReactNode; error: string | null }) {
  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-2">{children}</div>
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  );
}

function ActionButton({
  onClick,
  loading,
  disabled,
  tone = "default",
  children,
}: {
  onClick: () => void;
  loading: boolean;
  disabled: boolean;
  tone?: "default" | "primary" | "danger";
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        "rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 " +
        (tone === "primary"
          ? "bg-sky-500/20 text-sky-300 hover:bg-sky-500/30"
          : tone === "danger"
            ? "bg-rose-500/15 text-rose-300 hover:bg-rose-500/25"
            : "bg-white/5 text-slate-300 hover:bg-white/10")
      }
    >
      {loading ? "…" : children}
    </button>
  );
}

export function ReportActions({ reportId }: { reportId: string }) {
  const { dict } = useLocale();
  const { run, busy, error } = useModerationAction("/api/admin/reports/" + reportId);
  return (
    <ActionRow error={error}>
      <ActionButton loading={busy === "reviewed"} disabled={busy !== null} onClick={() => void run("reviewed", { status: "reviewed" })}>
        {dict.admin.markReviewed}
      </ActionButton>
      <ActionButton loading={busy === "dismissed"} disabled={busy !== null} onClick={() => void run("dismissed", { status: "dismissed" })}>
        {dict.admin.dismiss}
      </ActionButton>
      <ActionButton tone="danger" loading={busy === "actioned"} disabled={busy !== null} onClick={() => void run("actioned", { status: "actioned" })}>
        {dict.admin.markActioned}
      </ActionButton>
    </ActionRow>
  );
}

export function VerificationActions({ providerId }: { providerId: string }) {
  const { dict } = useLocale();
  const { run, busy, error } = useModerationAction("/api/admin/providers/" + providerId + "/verification");
  return (
    <ActionRow error={error}>
      <ActionButton tone="primary" loading={busy === "verified"} disabled={busy !== null} onClick={() => void run("verified", { status: "verified" })}>
        {dict.admin.verify}
      </ActionButton>
      <ActionButton tone="danger" loading={busy === "suspended"} disabled={busy !== null} onClick={() => void run("suspended", { status: "suspended" })}>
        {dict.admin.suspend}
      </ActionButton>
    </ActionRow>
  );
}

export function ContributionActions({ contributionId }: { contributionId: string }) {
  const { dict } = useLocale();
  const { run, busy, error } = useModerationAction("/api/admin/contributions/" + contributionId);
  return (
    <ActionRow error={error}>
      <ActionButton tone="primary" loading={busy === "approved"} disabled={busy !== null} onClick={() => void run("approved", { status: "approved" })}>
        {dict.admin.approve}
      </ActionButton>
      <ActionButton tone="danger" loading={busy === "rejected"} disabled={busy !== null} onClick={() => void run("rejected", { status: "rejected" })}>
        {dict.admin.reject}
      </ActionButton>
    </ActionRow>
  );
}

export function PlaceActions({ placeId, status }: { placeId: string; status: string }) {
  const { dict } = useLocale();
  const { run, busy, error } = useModerationAction("/api/admin/places/" + placeId);
  return (
    <ActionRow error={error}>
      {status !== "approved" && (
        <ActionButton tone="primary" loading={busy === "approved"} disabled={busy !== null} onClick={() => void run("approved", { status: "approved" })}>
          {dict.admin.approve}
        </ActionButton>
      )}
      {status !== "flagged" && (
        <ActionButton loading={busy === "flagged"} disabled={busy !== null} onClick={() => void run("flagged", { status: "flagged" })}>
          {dict.backoffice.statusFlagged}
        </ActionButton>
      )}
      {status !== "rejected" && (
        <ActionButton tone="danger" loading={busy === "rejected"} disabled={busy !== null} onClick={() => void run("rejected", { status: "rejected" })}>
          {dict.admin.reject}
        </ActionButton>
      )}
    </ActionRow>
  );
}

export function ReviewActions({ reviewId, status }: { reviewId: string; status: string }) {
  const { dict } = useLocale();
  const { run, busy, error } = useModerationAction("/api/admin/reviews/" + reviewId);
  return (
    <ActionRow error={error}>
      {status !== "published" && (
        <ActionButton tone="primary" loading={busy === "published"} disabled={busy !== null} onClick={() => void run("published", { status: "published" })}>
          {dict.backoffice.restoreReview}
        </ActionButton>
      )}
      {status !== "removed" && (
        <ActionButton tone="danger" loading={busy === "removed"} disabled={busy !== null} onClick={() => void run("removed", { status: "removed" })}>
          {dict.backoffice.removeReview}
        </ActionButton>
      )}
    </ActionRow>
  );
}

export function CommunityPostActions({ postId }: { postId: string }) {
  const { dict } = useLocale();
  const { run, busy, error } = useModerationAction("/api/community/posts/" + postId, "DELETE");
  return (
    <ActionRow error={error}>
      <ActionButton tone="danger" loading={busy === "remove"} disabled={busy !== null} onClick={() => void run("remove")}>
        {dict.backoffice.removePost}
      </ActionButton>
    </ActionRow>
  );
}

const ROLES = ["traveler", "provider", "admin"] as const;

export function RoleSelect({ userId, currentRole, isSelf }: { userId: string; currentRole: string; isSelf: boolean }) {
  const { dict } = useLocale();
  const { run, busy, error } = useModerationAction("/api/admin/users/" + userId + "/role");
  const roleLabel: Record<(typeof ROLES)[number], string> = {
    traveler: dict.backoffice.roleTraveler,
    provider: dict.backoffice.roleProvider,
    admin: dict.backoffice.roleAdmin,
  };

  if (isSelf) return <p className="text-xs text-slate-500">{dict.backoffice.cannotChangeSelf}</p>;

  return (
    <div>
      <select
        value={currentRole}
        disabled={busy !== null}
        onChange={(event) => {
          const nextRole = event.target.value;
          if (nextRole === currentRole) return;
          if (!window.confirm(dict.backoffice.confirmRoleChange)) return;
          void run(nextRole, { role: nextRole });
        }}
        className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-200 outline-none focus:ring-2 focus:ring-sky-500/40"
      >
        {ROLES.map((role) => (
          <option key={role} value={role} className="bg-slate-900">
            {roleLabel[role]}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-rose-400">{error}</p>}
    </div>
  );
}
