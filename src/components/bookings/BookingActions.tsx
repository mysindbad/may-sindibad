"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/i18n/LocaleProvider";
import { ConfirmButton, InlineAlert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/primitives";
import { buildLoginPath } from "@/lib/auth/return-path";

export function BookingActions({ bookingId, status, paymentsConfigured }: { bookingId: string; status: string; paymentsConfigured: boolean }) {
  const { dict, locale } = useLocale();
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => (typeof crypto !== "undefined" ? crypto.randomUUID() : `${Date.now()}`));

  async function cancelBooking() {
    const res = await fetch(`/api/bookings/${bookingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    if (res.status === 401) {
      router.push(buildLoginPath(locale, `/${locale}/bookings/${bookingId}`));
      return;
    }
    if (res.ok) router.refresh();
    else {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error ?? dict.common.somethingWentWrong);
    }
  }

  async function requestPayment() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/payments/create-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, idempotencyKey, locale }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.push(buildLoginPath(locale, `/${locale}/bookings/${bookingId}`));
        return;
      }
      if (!res.ok) {
        if (data.code === "payment_attempt_closed") {
          setIdempotencyKey(typeof crypto !== "undefined" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
        }
        setMessage(data.error ?? dict.common.somethingWentWrong);
        return;
      }
      if (data.configured === false) {
        setMessage(dict.bookings.paymentNotConfigured);
      } else if (typeof data.redirectUrl === "string" && data.redirectUrl.startsWith("https://")) {
        window.location.assign(data.redirectUrl);
        return;
      } else if (data.payment?.provider === "demo") {
        setMessage(dict.bookings.paymentDemoNotice);
        router.refresh();
      } else {
        setMessage(dict.common.somethingWentWrong);
      }
    } catch {
      setMessage(dict.errors.network);
    } finally {
      setBusy(false);
    }
  }

  const canCancel = status === "draft" || status === "pending" || status === "awaiting_payment";
  const canPay = status === "awaiting_payment";

  return (
    <div className="space-y-3">
      {canPay && (
        <div>
          <Button onClick={requestPayment} loading={busy}>
            {dict.bookings.continueToPayment}
          </Button>
          {!paymentsConfigured && <p className="mt-1 text-xs text-slate-400">{dict.common.notConfigured}</p>}
        </div>
      )}
      {message && <InlineAlert tone="info">{message}</InlineAlert>}
      {canCancel && <ConfirmButton label={dict.bookings.cancelBooking} confirmLabel={dict.bookings.cancelConfirm} onConfirm={cancelBooking} />}
    </div>
  );
}
