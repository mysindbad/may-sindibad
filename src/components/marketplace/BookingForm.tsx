"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/i18n/LocaleProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button, Input, Label } from "@/components/ui/primitives";
import { InlineAlert } from "@/components/ui/feedback";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";
import { buildLoginPath } from "@/lib/auth/return-path";

interface ServiceOption {
  id: string;
  name: string;
  category: string;
  priceAmount: string | null;
  priceCurrency: string;
}

export function BookingForm({ providerId, services }: { providerId: string; services: ServiceOption[] }) {
  const { dict, locale } = useLocale();
  const { user } = useAuth();
  const router = useRouter();

  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [guestsCount, setGuestsCount] = useState(1);
  const [contactName, setContactName] = useState(user?.name ?? "");
  const [contactEmail, setContactEmail] = useState(user?.email ?? "");
  const [contactPhone, setContactPhone] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [idempotencyKey] = useState(() => (typeof crypto !== "undefined" ? crypto.randomUUID() : `${Date.now()}`));

  if (!user) {
    return (
      <InlineAlert tone="info">
        {dict.errors.unauthorized}{" "}
        <Link href={buildLoginPath(locale, `/${locale}/marketplace/${providerId}`)} className="font-semibold underline">
          {dict.nav.login}
        </Link>
      </InlineAlert>
    );
  }

  if (services.length === 0) {
    return <p className="text-sm text-slate-500">{dict.bookings.noBookableServices}</p>;
  }

  const selectedService = services.find((s) => s.id === serviceId);
  const needsStartDate = selectedService ? selectedService.category !== "other" : true;
  const needsEndDate = selectedService ? ["hotel", "vehicle", "boat"].includes(selectedService.category) : false;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setResult(null);

    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId,
          serviceId,
          category: selectedService?.category ?? "other",
          guestsCount,
          startDate: startDate || undefined,
          endDate: needsEndDate ? endDate || undefined : undefined,
          contactName,
          contactEmail,
          contactPhone: contactPhone || undefined,
          idempotencyKey,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        router.push(buildLoginPath(locale, `/${locale}/marketplace/${providerId}`));
        return;
      }
      if (!res.ok) {
        setResult({ tone: "error", text: data.error ?? dict.common.somethingWentWrong });
        return;
      }

      if (data.duplicate) {
        setResult({ tone: "success", text: dict.bookings.duplicateBlocked });
      } else {
        setResult({ tone: "success", text: dict.bookings.statusPending });
      }
      setTimeout(() => router.push(`/${locale}/bookings/${data.booking.id}`), 800);
    } catch {
      setResult({ tone: "error", text: dict.errors.network });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div>
        <Label htmlFor="booking-service">{dict.bookings.service}</Label>
        <select
          id="booking-service"
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
        >
          {services.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name} {service.priceAmount ? `— ${formatCurrency(service.priceAmount, service.priceCurrency, locale)}` : ""}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="booking-guests">{dict.bookings.guests}</Label>
        <Input id="booking-guests" type="number" min={1} max={50} value={guestsCount} onChange={(e) => setGuestsCount(Number(e.target.value))} />
      </div>
      <div>
        <Label htmlFor="booking-start-date">{dict.bookings.date}</Label>
        <Input id="booking-start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required={needsStartDate} />
      </div>
      {needsEndDate && (
        <div>
          <Label htmlFor="booking-end-date">{dict.bookings.endDate}</Label>
          <Input id="booking-end-date" type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} required />
        </div>
      )}
      <div>
        <Label htmlFor="booking-contact-name">{dict.auth.name}</Label>
        <Input id="booking-contact-name" value={contactName} onChange={(e) => setContactName(e.target.value)} required />
      </div>
      <div>
        <Label htmlFor="booking-contact-email">{dict.auth.email}</Label>
        <Input id="booking-contact-email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} required />
      </div>
      <div>
        <Label htmlFor="booking-contact-phone">
          Phone ({dict.common.optional})
        </Label>
        <Input id="booking-contact-phone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
      </div>

      {result && <InlineAlert tone={result.tone}>{result.text}</InlineAlert>}

      <Button type="submit" fullWidth loading={busy}>
        {dict.bookings.bookNow}
      </Button>
    </form>
  );
}
