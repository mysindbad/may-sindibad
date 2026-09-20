"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/i18n/LocaleProvider";
import { Button, Input, Label, Textarea } from "@/components/ui/primitives";
import { InlineAlert } from "@/components/ui/feedback";
import { buildLoginPath } from "@/lib/auth/return-path";

// PATCH /api/providers/[id] existed from the start, but no screen ever called
// it: an owner could create a listing and then never correct a phone number,
// address or description again.
export function BusinessEditForm({
  provider,
}: {
  provider: {
    id: string;
    name: string;
    description: string | null;
    city: string;
    country: string;
    address: string | null;
    phone: string | null;
    website: string | null;
    verificationStatus: string;
  };
}) {
  const { dict, locale } = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(provider.name);
  const [description, setDescription] = useState(provider.description ?? "");
  const [city, setCity] = useState(provider.city);
  const [country, setCountry] = useState(provider.country);
  const [address, setAddress] = useState(provider.address ?? "");
  const [phone, setPhone] = useState(provider.phone ?? "");
  const [website, setWebsite] = useState(provider.website ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Optional fields are omitted rather than sent empty: the API validates
      // website/address/phone shapes and would reject "" outright.
      const payload: Record<string, string> = { name, city, country };
      if (description.trim()) payload.description = description.trim();
      if (address.trim()) payload.address = address.trim();
      if (phone.trim()) payload.phone = phone.trim();
      if (website.trim()) payload.website = website.trim();

      const res = await fetch("/api/providers/" + provider.id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.push(buildLoginPath(locale, "/" + locale + "/provider"));
        return;
      }
      if (!res.ok) {
        setError(data.error ?? dict.common.somethingWentWrong);
        return;
      }
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
        {dict.providerTools.editBusiness}
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-slate-200 p-4">
      <div>
        <Label htmlFor="business-name">{dict.providerTools.businessName}</Label>
        <Input id="business-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={200} />
      </div>
      <div>
        <Label htmlFor="business-description">{dict.common.description}</Label>
        <Textarea
          id="business-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={3000}
          rows={3}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="business-city">{dict.common.city}</Label>
          <Input id="business-city" value={city} onChange={(e) => setCity(e.target.value)} required maxLength={120} />
        </div>
        <div>
          <Label htmlFor="business-country">{dict.common.country}</Label>
          <Input id="business-country" value={country} onChange={(e) => setCountry(e.target.value)} required maxLength={120} />
        </div>
      </div>
      <div>
        <Label htmlFor="business-address">{dict.providerTools.address}</Label>
        <Input id="business-address" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="business-phone">{dict.providerTools.phone}</Label>
          <Input id="business-phone" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} />
        </div>
        <div>
          <Label htmlFor="business-website">{dict.providerTools.website}</Label>
          <Input
            id="business-website"
            type="url"
            placeholder="https://"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            maxLength={300}
          />
        </div>
      </div>

      {provider.verificationStatus === "verified" && <InlineAlert tone="warning">{dict.providerTools.verificationResetNotice}</InlineAlert>}
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
