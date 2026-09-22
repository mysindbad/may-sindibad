"use client";

import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { BottomNav } from "./BottomNav";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { useLocale } from "@/i18n/LocaleProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import Link from "next/link";

export function AppShell({ children }: { children: ReactNode }) {
  const { locale, dict } = useLocale();
  const { user } = useAuth();

  return (
    <div className="flex min-h-dvh bg-sand-50 dark:bg-brand-950">
      <Sidebar />
      <div className="flex min-h-dvh w-full flex-col">
        <TopBar />
        <header className="hidden items-center justify-end gap-3 border-b border-brand-900/8 bg-white px-8 py-3 md:flex dark:border-white/10 dark:bg-brand-950">
          <LocaleSwitcher />
          {!user && (
            <Link href={`/${locale}/login`} className="rounded-lg px-3 py-1.5 text-sm font-medium text-brand-800 hover:bg-brand-800/5 dark:text-sky-300 dark:hover:bg-white/5">
              {dict.nav.login}
            </Link>
          )}
          {!user && (
            <Link href={`/${locale}/signup`} className="rounded-lg bg-brand-800 px-3 py-1.5 text-sm font-medium text-white">
              {dict.nav.signup}
            </Link>
          )}
        </header>
        <main className="flex-1 pb-20 md:pb-8">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
