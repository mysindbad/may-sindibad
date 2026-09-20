"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/i18n/LocaleProvider";
import { useAuth, type SessionUser } from "@/components/auth/AuthProvider";
import { Button, Input, Label } from "@/components/ui/primitives";
import { ConfirmButton, InlineAlert } from "@/components/ui/feedback";
import { buildLoginPath } from "@/lib/auth/return-path";

export function SettingsForm({ user }: { user: SessionUser }) {
  const { dict, locale } = useLocale();
  const router = useRouter();
  const { setUser } = useAuth();

  const [name, setName] = useState(user.name);
  const [homeCity, setHomeCity] = useState(user.homeCity ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, homeCity: homeCity || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.push(buildLoginPath(locale, `/${locale}/settings`));
        return;
      }
      if (!res.ok) {
        setResult({ tone: "error", text: data.error ?? dict.common.somethingWentWrong });
        return;
      }
      setUser(data.user);
      setResult({ tone: "success", text: dict.settings.saved });
    } catch {
      setResult({ tone: "error", text: dict.errors.network });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    const res = await fetch("/api/account", { method: "DELETE" });
    if (res.status === 401) {
      router.push(buildLoginPath(locale, `/${locale}/settings`));
      return;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.code === "reauth_required") {
        router.push(buildLoginPath(locale, `/${locale}/settings`));
        return;
      }
      setResult({ tone: "error", text: data.error ?? dict.common.somethingWentWrong });
      return;
    }
    // DELETE /api/account already destroys the authoritative server session.
    // Reflect that confirmed result locally instead of issuing a second logout
    // request whose network failure could create a false error state.
    setUser(null);
    router.push(`/${locale}`);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-md space-y-6 px-4 py-6">
      <h1 className="text-xl font-semibold text-brand-950">{dict.settings.title}</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="settings-name">{dict.auth.name}</Label>
          <Input id="settings-name" value={name} onChange={(e) => setName(e.target.value)} minLength={2} required />
        </div>
        <div>
          <Label htmlFor="settings-home-city">{dict.settings.homeCity}</Label>
          <Input id="settings-home-city" value={homeCity} onChange={(e) => setHomeCity(e.target.value)} placeholder={dict.settings.homeCityPlaceholder} />
        </div>
        {result && <InlineAlert tone={result.tone}>{result.text}</InlineAlert>}
        <Button type="submit" loading={busy}>
          {dict.common.save}
        </Button>
      </form>

      <div className="border-t border-slate-200 pt-5">
        <h2 className="mb-2 text-sm font-semibold text-red-700">{dict.settings.account}</h2>
        <ConfirmButton label={dict.settings.deleteAccount} confirmLabel={dict.settings.deleteAccountConfirm} onConfirm={handleDelete} />
      </div>
    </div>
  );
}
