"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/i18n/LocaleProvider";
import { Button } from "@/components/ui/primitives";
import { InlineAlert } from "@/components/ui/feedback";
import { buildLoginPath } from "@/lib/auth/return-path";

export function ProviderBookingActions({ bookingId }: { bookingId: string }) {
  const { dict, locale } = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState<"accept" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "accept" | "reject") {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/provider-bookings/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.status === 401) {
        router.push(buildLoginPath(locale, `/${locale}/provider`));
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

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button size="sm" onClick={() => act("accept")} loading={busy === "accept"} disabled={busy !== null}>
          {dict.bookings.acceptBooking}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => act("reject")} loading={busy === "reject"} disabled={busy !== null}>
          {dict.bookings.rejectBooking}
        </Button>
      </div>
      {error && <InlineAlert tone="error">{error}</InlineAlert>}
    </div>
  );
}
