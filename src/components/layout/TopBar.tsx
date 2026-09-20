"use client";

import Link from "next/link";
import { useLocale } from "@/i18n/LocaleProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { LocaleSwitcher } from "./LocaleSwitcher";

export function TopBar() {
  const { locale, dict } = useLocale();
  const { user } = useAuth();

  return (
    <header className="safe-top sticky top-0 z-30 flex items-center justify-between border-b border-brand-900/8 bg-white/90 px-4 py-3 backdrop-blur md:hidden">
      <Link href={`/${locale}`} className="flex items-center gap-2">
        <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-lg bg-brand-800 text-base text-white">🧞</span>
        <span className="text-base font-semibold text-brand-950">{dict.common.appName}</span>
      </Link>
      <div className="flex items-center gap-2">
        <LocaleSwitcher />
        {!user && (
          <Link href={`/${locale}/login`} className="rounded-lg bg-brand-800 px-3 py-1.5 text-xs font-medium text-white">
            {dict.nav.login}
          </Link>
        )}
      </div>
    </header>
  );
}
