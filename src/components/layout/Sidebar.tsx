"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "@/i18n/LocaleProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { NAV_ITEMS } from "./nav-items";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const { locale, dict } = useLocale();
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-e border-brand-900/8 bg-white p-5 md:flex">
      <Link href={`/${locale}`} className="mb-8 flex items-center gap-2 px-1">
        <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-xl bg-brand-800 text-lg text-white">🧞</span>
        <span className="text-lg font-semibold text-brand-950">{dict.common.appName}</span>
      </Link>

      <nav className="flex-1">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const href = `/${locale}${item.href}`;
            const isActive = pathname === href || (item.href !== "" && pathname.startsWith(href));
            return (
              <li key={item.key}>
                <Link
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive ? "bg-brand-800/10 text-brand-800" : "text-slate-600 hover:bg-slate-100",
                  )}
                >
                  <span aria-hidden="true" className="text-base">{item.icon}</span>
                  {dict.nav[item.key]}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-brand-900/8 pt-4">
        {user ? (
          <Link href={`/${locale}/settings`} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
            ⚙️ {dict.nav.settings}
          </Link>
        ) : (
          <Link href={`/${locale}/login`} className="flex items-center gap-2 rounded-xl bg-brand-800 px-3 py-2.5 text-sm font-medium text-white">
            {dict.nav.login}
          </Link>
        )}
      </div>
    </aside>
  );
}
