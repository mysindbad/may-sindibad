"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/i18n/LocaleProvider";
import { Button } from "@/components/ui/primitives";
import { buildLoginPath } from "@/lib/auth/return-path";

export function ConfirmContributionButton({ contributionId, disabled }: { contributionId: string; disabled: boolean }) {
  const { dict, locale } = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function handleClick() {
    setBusy(true);
    try {
      const res = await fetch(`/api/contributions/${contributionId}/confirm`, { method: "POST" });
      if (res.status === 401) {
        router.push(buildLoginPath(locale, `/${locale}/community`));
        return;
      }
      if (res.ok) {
        setDone(true);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" variant="secondary" loading={busy} disabled={disabled || done} onClick={handleClick}>
      <span aria-hidden="true">✓</span> {dict.community.confirm}
    </Button>
  );
}
