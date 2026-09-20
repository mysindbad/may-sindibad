"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/i18n/LocaleProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button, Input, Label, FieldError } from "@/components/ui/primitives";
import { InlineAlert } from "@/components/ui/feedback";
import { sanitizeReturnPath } from "@/lib/auth/return-path";
import Link from "next/link";

interface AuthFormProps {
  mode: "login" | "signup";
  googleEnabled?: boolean;
  nextPath?: string;
  authError?: string | null;
}

export function AuthForm({ mode, googleEnabled = false, nextPath, authError }: AuthFormProps) {
  const { dict, locale } = useLocale();
  const router = useRouter();
  const { setUser, refresh } = useAuth();
  const safeNextPath = sanitizeReturnPath(nextPath, `/${locale}`);
  const hasProtectedReturn = safeNextPath !== `/${locale}`;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(authErrorMessage(authError, dict));
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "signup" ? { email, password, name } : { email, password }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data.code === "invalid_credentials") setError(dict.auth.invalidCredentials);
        else if (data.code === "email_in_use") setError(dict.auth.emailInUse);
        else setError(data.error ?? dict.common.somethingWentWrong);
        return;
      }

      setUser(data.user);
      await refresh();
      router.push(safeNextPath);
      router.refresh();
    } catch {
      setError(dict.errors.network);
    } finally {
      setBusy(false);
    }
  }

  const nextQuery = hasProtectedReturn ? `?next=${encodeURIComponent(safeNextPath)}` : "";
  const googleHref = `/api/auth/google/start?locale=${encodeURIComponent(locale)}&next=${encodeURIComponent(safeNextPath)}`;

  return (
    <div className="mx-auto max-w-sm px-5 py-10">
      <h1 className="text-2xl font-semibold text-brand-950">{mode === "login" ? dict.auth.loginTitle : dict.auth.signupTitle}</h1>
      <p className="mt-1 text-sm text-slate-600">{mode === "login" ? dict.auth.loginSubtitle : dict.auth.signupSubtitle}</p>

      {hasProtectedReturn && (
        <div className="mt-4">
          <InlineAlert tone="info">{dict.auth.accountRequired}</InlineAlert>
        </div>
      )}

      {googleEnabled && (
        <div className="mt-6">
          <a
            href={googleHref}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-brand-950 transition hover:bg-slate-50"
          >
            <span aria-hidden="true" className="text-base font-bold">G</span>
            {dict.auth.continueWithGoogle}
          </a>
          <div className="my-4 flex items-center gap-3 text-xs text-slate-400" aria-hidden="true">
            <span className="h-px flex-1 bg-slate-200" />
            <span>{dict.auth.or}</span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className={googleEnabled ? "space-y-4" : "mt-6 space-y-4"}>
        {mode === "signup" && (
          <div>
            <Label htmlFor="name">{dict.auth.name}</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} autoComplete="name" />
          </div>
        )}
        <div>
          <Label htmlFor="email">{dict.auth.email}</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </div>
        <div>
          <Label htmlFor="password">{dict.auth.password}</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={mode === "signup" ? 8 : 1}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
          {mode === "signup" && <FieldError>{dict.auth.weakPassword}</FieldError>}
        </div>

        {error && <InlineAlert tone="error">{error}</InlineAlert>}

        <Button type="submit" fullWidth loading={busy}>
          {mode === "login" ? dict.nav.login : dict.nav.signup}
        </Button>
      </form>

      <div className="mt-5 space-y-3 text-center text-sm">
        {mode === "login" ? (
          <p className="text-slate-600">
            {dict.auth.noAccount}{" "}
            <Link href={`/${locale}/signup${nextQuery}`} className="font-medium text-sky-600">
              {dict.nav.signup}
            </Link>
          </p>
        ) : (
          <p className="text-slate-600">
            {dict.auth.haveAccount}{" "}
            <Link href={`/${locale}/login${nextQuery}`} className="font-medium text-sky-600">
              {dict.nav.login}
            </Link>
          </p>
        )}
        <Link href={`/${locale}`} className="block font-medium text-slate-400">
          {dict.auth.continueAsGuest}
        </Link>
        <p className="text-xs text-slate-400">{dict.auth.guestNotice}</p>
      </div>
    </div>
  );
}

function authErrorMessage(code: string | null | undefined, dict: ReturnType<typeof useLocale>["dict"]): string | null {
  switch (code) {
    case "google_access_denied":
      return dict.auth.googleAccessDenied;
    case "google_account_conflict":
      return dict.auth.googleAccountConflict;
    case "google_unverified_email":
      return dict.auth.googleUnverifiedEmail;
    case "google_not_configured":
      return dict.auth.googleNotConfigured;
    case "google_failed":
      return dict.auth.googleFailed;
    default:
      return null;
  }
}
