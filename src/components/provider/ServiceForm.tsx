"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/i18n/LocaleProvider";
import { Button, Input, Label, Select } from "@/components/ui/primitives";
import { InlineAlert } from "@/components/ui/feedback";
import { buildLoginPath } from "@/lib/auth/return-path";
import { categoryLabel } from "@/lib/domain/category-labels";

const CATEGORIES = ["hotel", "restaurant", "activity", "tour", "vehicle", "boat", "transfer", "other"] as const;

export function ServiceForm({ providerId }: { providerId: string }) {
  const { dict, locale } = useLocale();
  const router = useRouter();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("activity");
  const [priceAmount, setPriceAmount] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/provider-services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId, name, category, priceAmount: priceAmount === "" ? undefined : Number(priceAmount), priceCurrency: "USD" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.push(buildLoginPath(locale, `/${locale}/provider`));
        return;
      }
      if (!res.ok) {
        setError(data.error ?? dict.common.somethingWentWrong);
        return;
      }
      setName("");
      setPriceAmount("");
      setOpen(false);
      router.refresh();
    } catch {
      setError(dict.errors.network);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        + {dict.marketplace.addService}
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-slate-200 p-4">
      <div>
        <Label htmlFor="service-name">{dict.marketplace.serviceName}</Label>
        <Input id="service-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="service-category">{dict.marketplace.category}</Label>
          <Select id="service-category" value={category} onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c, dict)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="service-price">{dict.marketplace.priceUsd}</Label>
          <Input id="service-price" type="number" min={0} value={priceAmount} onChange={(e) => setPriceAmount(e.target.value === "" ? "" : Number(e.target.value))} />
        </div>
      </div>
      {error && <InlineAlert tone="error">{error}</InlineAlert>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={busy}>
          {dict.common.save}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {dict.common.cancel}
        </Button>
      </div>
    </form>
  );
}
