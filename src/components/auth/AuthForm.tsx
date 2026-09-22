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
    <div className="mx-auto min-h-[calc(100dvh-56px)] max-w-sm md:min-h-[calc(100dvh-64px)]">
      <div className="rounded-b-[2.5rem] bg-gradient-to-br from-brand-900 via-brand-800 to-sky-600 px-6 pb-10 pt-12 text-center text-white shadow-[var(--shadow-elevated)]">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/15 text-3xl ring-2 ring-white/30 backdrop-blur-sm">
          🧞
        </span>
        <h1 className="mt-4 text-2xl font-semibold">{mode === "login" ? dict.auth.loginTitle : dict.auth.signupTitle}</h1>
        <p className="mt-1.5 text-sm text-white/75">{mode === "login" ? dict.auth.loginSubtitle : dict.auth.signupSubtitle}</p>
      </div>

      <div className="px-5 pb-10 pt-7">
        {hasProtectedReturn && (
          <div className="mb-5">
            <InlineAlert tone="info">{dict.auth.accountRequired}</InlineAlert>
          </div>
        )}

        {googleEnabled && (
          <div className="mb-6">
            <a
              href={googleHref}
              className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-brand-950 shadow-sm transition hover:border-slate-300 hover:shadow-md"
            >
              <GoogleIcon />
              {dict.auth.continueWithGoogle}
            </a>
            <div className="my-5 flex items-center gap-3 text-xs text-slate-400" aria-hidden="true">
              <span className="h-px flex-1 bg-slate-200" />
              <span>{dict.auth.or}</span>
              <span className="h-px flex-1 bg-slate-200" />
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
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

          <Button type="submit" fullWidth loading={busy} size="lg">
            {mode === "login" ? dict.nav.login : dict.nav.signup}
          </Button>
        </form>

        <div className="mt-6 space-y-3 text-center text-sm">
          {mode === "login" ? (
            <p className="text-slate-600 dark:text-slate-400">
              {dict.auth.noAccount}{" "}
              <Link href={`/${locale}/signup${nextQuery}`} className="font-medium text-sky-600">
                {dict.nav.signup}
              </Link>
            </p>
          ) : (
            <p className="text-slate-600 dark:text-slate-400">
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
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path fill="#FBBC05" d="M3.96 10.71a5.4 5.4 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3-2.33Z" />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
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
