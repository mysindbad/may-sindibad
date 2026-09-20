"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/i18n/LocaleProvider";
import { Button } from "@/components/ui/primitives";
import { InlineAlert } from "@/components/ui/feedback";
import { buildLoginPath } from "@/lib/auth/return-path";

// The moderation endpoints under /api/admin/* were written as "backend-only
// primitives" with no dashboard, which meant nothing could actually be
// moderated in production. These buttons are the missing front end.
function useModerationAction(endpoint: string) {
  const { dict, locale } = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, body: Record<string, unknown>) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        router.push(buildLoginPath(locale, "/" + locale + "/admin"));
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
      {error && <InlineAlert tone="error">{error}</InlineAlert>}
    </div>
  );
}

export function ReportActions({ reportId }: { reportId: string }) {
  const { dict } = useLocale();
  const { run, busy, error } = useModerationAction("/api/admin/reports/" + reportId);

  return (
    <ActionRow error={error}>
      <Button size="sm" variant="ghost" loading={busy === "reviewed"} disabled={busy !== null} onClick={() => void run("reviewed", { status: "reviewed" })}>
        {dict.admin.markReviewed}
      </Button>
      <Button size="sm" variant="ghost" loading={busy === "dismissed"} disabled={busy !== null} onClick={() => void run("dismissed", { status: "dismissed" })}>
        {dict.admin.dismiss}
      </Button>
      <Button size="sm" variant="danger" loading={busy === "actioned"} disabled={busy !== null} onClick={() => void run("actioned", { status: "actioned" })}>
        {dict.admin.markActioned}
      </Button>
    </ActionRow>
  );
}

export function VerificationActions({ providerId }: { providerId: string }) {
  const { dict } = useLocale();
  const { run, busy, error } = useModerationAction("/api/admin/providers/" + providerId + "/verification");

  return (
    <ActionRow error={error}>
      <Button size="sm" loading={busy === "verified"} disabled={busy !== null} onClick={() => void run("verified", { status: "verified" })}>
        {dict.admin.verify}
      </Button>
      <Button size="sm" variant="danger" loading={busy === "suspended"} disabled={busy !== null} onClick={() => void run("suspended", { status: "suspended" })}>
        {dict.admin.suspend}
      </Button>
    </ActionRow>
  );
}

export function ContributionActions({ contributionId }: { contributionId: string }) {
  const { dict } = useLocale();
  const { run, busy, error } = useModerationAction("/api/admin/contributions/" + contributionId);

  return (
    <ActionRow error={error}>
      <Button size="sm" loading={busy === "approved"} disabled={busy !== null} onClick={() => void run("approved", { status: "approved" })}>
        {dict.admin.approve}
      </Button>
      <Button size="sm" variant="danger" loading={busy === "rejected"} disabled={busy !== null} onClick={() => void run("rejected", { status: "rejected" })}>
        {dict.admin.reject}
      </Button>
    </ActionRow>
  );
}
