"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { BottomNav } from "./BottomNav";
import { useLocale } from "@/i18n/LocaleProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import Link from "next/link";

// Login/signup are their own focused, full-screen moment - the app's nav
// (bottom bar on mobile, sidebar on desktop) points at destinations that are
// meaningless before the traveller has an account, so it only clutters a
// screen that's supposed to feel clean and deliberate.
const AUTH_PATH_PATTERN = /^\/[a-z]{2}\/(login|signup)(\/|$)/;

export function AppShell({ children }: { children: ReactNode }) {
  const { locale, dict } = useLocale();
  const { user } = useAuth();
  const pathname = usePathname();
  const isAuthPage = AUTH_PATH_PATTERN.test(pathname);

  if (isAuthPage) {
    return (
      <div className="flex min-h-dvh flex-col bg-sand-50 dark:bg-brand-950">
        <TopBar />
        <main className="flex-1">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh bg-sand-50 dark:bg-brand-950">
      <Sidebar />
      <div className="flex min-h-dvh w-full flex-col">
        <TopBar />
        <header className="hidden items-center justify-end gap-3 border-b border-brand-900/8 bg-white px-8 py-3 md:flex dark:border-white/10 dark:bg-brand-950">
          {user ? (
            <Link href={`/${locale}/profile`} aria-label={dict.nav.profile}>
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- remote avatar comes from arbitrary S3/local hosts, not the local image loader's fixed domain list.
                <img src={user.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover ring-1 ring-brand-900/10 dark:ring-white/15" />
              ) : (
                <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-800 text-sm font-semibold text-white">
                  {user.name.slice(0, 1).toUpperCase()}
                </span>
              )}
            </Link>
          ) : (
            <>
              <Link href={`/${locale}/login`} className="rounded-lg px-3 py-1.5 text-sm font-medium text-brand-800 hover:bg-brand-800/5 dark:text-sky-300 dark:hover:bg-white/5">
                {dict.nav.login}
              </Link>
              <Link href={`/${locale}/signup`} className="rounded-lg bg-brand-800 px-3 py-1.5 text-sm font-medium text-white">
                {dict.nav.signup}
              </Link>
            </>
          )}
        </header>
        <main className="flex-1 pb-20 md:pb-8">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
