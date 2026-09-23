"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/i18n/LocaleProvider";
import { useAuth, type SessionUser } from "@/components/auth/AuthProvider";
import { Button, Input, Label } from "@/components/ui/primitives";
import { ConfirmButton, InlineAlert } from "@/components/ui/feedback";
import { buildLoginPath } from "@/lib/auth/return-path";
import { AppearanceSettings } from "./AppearanceSettings";
import { SindbadMemoryPanel } from "./SindbadMemoryPanel";
import { SettingsSection } from "./SettingsSection";

export function SettingsForm({ user }: { user: SessionUser }) {
  const { dict, locale } = useLocale();
  const router = useRouter();
  const { setUser } = useAuth();

  const [name, setName] = useState(user.name);
  const [homeCity, setHomeCity] = useState(user.homeCity ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setAvatarBusy(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("ownerType", "avatar");
      const uploadRes = await fetch("/api/uploads", { method: "POST", body: form });
      const uploadData = await uploadRes.json().catch(() => ({}));
      if (uploadRes.status === 401) {
        router.push(buildLoginPath(locale, `/${locale}/settings`));
        return;
      }
      if (!uploadRes.ok) {
        setResult({ tone: "error", text: uploadData.error ?? dict.common.somethingWentWrong });
        return;
      }
      const patchRes = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: uploadData.media.url }),
      });
      const patchData = await patchRes.json().catch(() => ({}));
      if (!patchRes.ok) {
        setResult({ tone: "error", text: patchData.error ?? dict.common.somethingWentWrong });
        return;
      }
      setAvatarUrl(patchData.user.avatarUrl);
      setUser(patchData.user);
    } catch {
      setResult({ tone: "error", text: dict.errors.network });
    } finally {
      setAvatarBusy(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  }

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
      <h1 className="text-xl font-semibold text-brand-950 dark:text-sand-50">{dict.settings.title}</h1>

      <div className="space-y-3">
        <SettingsSection icon="👤" title={dict.profile.title} subtitle={name} defaultOpen>
          <div className="flex items-center gap-4">
            <div className="relative">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- remote avatar comes from arbitrary S3/local hosts, not the local image loader's fixed domain list.
                <img src={avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
              ) : (
                <div className="grid h-16 w-16 place-items-center rounded-full bg-brand-800 text-xl font-semibold text-white">
                  {name.slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>
            <div>
              <input ref={avatarInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" id="avatar-input" />
              <label
                htmlFor="avatar-input"
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-brand-800 hover:bg-slate-50 dark:border-white/15 dark:text-sky-300 dark:hover:bg-white/5"
              >
                {avatarBusy ? dict.common.loading : `📷 ${dict.settings.changePhoto}`}
              </label>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="settings-name">{dict.auth.name}</Label>
              <Input id="settings-name" value={name} onChange={(e) => setName(e.target.value)} minLength={2} required />
            </div>
            <div>
              <Label htmlFor="settings-home-city">{dict.settings.homeCity}</Label>
              <Input
                id="settings-home-city"
                value={homeCity}
                onChange={(e) => setHomeCity(e.target.value)}
                placeholder={dict.settings.homeCityPlaceholder}
              />
            </div>
            {result && <InlineAlert tone={result.tone}>{result.text}</InlineAlert>}
            <Button type="submit" loading={busy}>
              {dict.common.save}
            </Button>
          </form>
        </SettingsSection>

        <SettingsSection icon="🎨" title={dict.settings.appearance}>
          <AppearanceSettings />
        </SettingsSection>

        <SettingsSection icon="🧠" title={dict.sindbadMemory.title} subtitle={dict.sindbadMemory.subtitle}>
          <SindbadMemoryPanel />
        </SettingsSection>

        <SettingsSection icon="⚠️" title={dict.settings.account} danger>
          <ConfirmButton label={dict.settings.deleteAccount} confirmLabel={dict.settings.deleteAccountConfirm} onConfirm={handleDelete} />
        </SettingsSection>
      </div>
    </div>
  );
}
