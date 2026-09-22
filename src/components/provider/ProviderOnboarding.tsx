"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/i18n/LocaleProvider";
import { Button, Input, Label, Textarea } from "@/components/ui/primitives";
import { InlineAlert } from "@/components/ui/feedback";
import { buildLoginPath } from "@/lib/auth/return-path";

export function ProviderOnboarding() {
  const { dict, locale } = useLocale();
  const router = useRouter();

  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("Morocco");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, city, country, description: description || undefined }),
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
      router.push(`/${locale}/provider`);
      router.refresh();
    } catch {
      setError(dict.errors.network);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-lg space-y-4 px-4 py-6">
      <h1 className="text-xl font-semibold text-brand-950 dark:text-sand-50">{dict.marketplace.createListing}</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">{dict.marketplace.becomeProviderBody}</p>

      <div>
        <Label htmlFor="provider-name">{dict.marketplace.businessName}</Label>
        <Input id="provider-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="provider-city">{dict.common.city}</Label>
          <Input id="provider-city" value={city} onChange={(e) => setCity(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="provider-country">{dict.common.country}</Label>
          <Input id="provider-country" value={country} onChange={(e) => setCountry(e.target.value)} required />
        </div>
      </div>
      <div>
        <Label htmlFor="provider-description">{dict.common.description} ({dict.common.optional})</Label>
        <Textarea id="provider-description" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      {error && <InlineAlert tone="error">{error}</InlineAlert>}

      <Button type="submit" fullWidth loading={busy}>
        {dict.marketplace.createListing}
      </Button>
    </form>
  );
}
