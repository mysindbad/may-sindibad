"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/i18n/LocaleProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button, Input, Label, Textarea } from "@/components/ui/primitives";
import { InlineAlert } from "@/components/ui/feedback";
import Link from "next/link";
import { buildLoginPath } from "@/lib/auth/return-path";

export function ContributeForm() {
  const { dict, locale } = useLocale();
  const { user } = useAuth();
  const router = useRouter();

  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("Morocco");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  if (!user) {
    return (
      <InlineAlert tone="info">
        {dict.errors.unauthorized}{" "}
        <Link href={buildLoginPath(locale, `/${locale}/community`)} className="font-semibold underline">
          {dict.nav.login}
        </Link>
      </InlineAlert>
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/contributions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "new_place",
          payload: { name, city, country, description },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.push(buildLoginPath(locale, `/${locale}/community`));
        return;
      }
      if (!res.ok) {
        setResult({ tone: "error", text: data.error ?? dict.common.somethingWentWrong });
        return;
      }
      setResult({ tone: "success", text: dict.settings.saved });
      setName("");
      setDescription("");
      router.refresh();
    } catch {
      setResult({ tone: "error", text: dict.errors.network });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div>
        <Label htmlFor="contribution-place-name">{dict.community.placeName}</Label>
        <Input id="contribution-place-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="contribution-city">{dict.common.city}</Label>
          <Input id="contribution-city" value={city} onChange={(e) => setCity(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="contribution-country">{dict.common.country}</Label>
          <Input id="contribution-country" value={country} onChange={(e) => setCountry(e.target.value)} required />
        </div>
      </div>
      <div>
        <Label htmlFor="contribution-info">{dict.community.travellerInfo}</Label>
        <Textarea id="contribution-info" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <p className="text-xs text-slate-400">{dict.community.trustNotice}</p>
      {result && <InlineAlert tone={result.tone}>{result.text}</InlineAlert>}
      <Button type="submit" loading={busy}>
        {dict.community.contribute}
      </Button>
    </form>
  );
}
