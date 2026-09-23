"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  icon: string;
  labelKey: "navOverview" | "navReports" | "navProviders" | "navContributions" | "navUsers" | "navPlaces" | "navReviews" | "navCommunity";
}

const NAV_ITEMS: NavItem[] = [
  { href: "", icon: "📊", labelKey: "navOverview" },
  { href: "/reports", icon: "🚩", labelKey: "navReports" },
  { href: "/providers", icon: "🏪", labelKey: "navProviders" },
  { href: "/contributions", icon: "📝", labelKey: "navContributions" },
  { href: "/users", icon: "👥", labelKey: "navUsers" },
  { href: "/places", icon: "📍", labelKey: "navPlaces" },
  { href: "/reviews", icon: "⭐", labelKey: "navReviews" },
  { href: "/community", icon: "💬", labelKey: "navCommunity" },
];

/** A dashboard is a different tool than the app it manages, not another tab
 * of it - a distinct dark shell (own nav, own header, no traveller chrome)
 * makes that obvious at a glance, on desktop and on a phone alike. */
export function AdminShell({ adminName, children }: { adminName: string; children: ReactNode }) {
  const { locale, dict } = useLocale();
  const pathname = usePathname();
  const base = `/${locale}/backoffice`;

  function isActive(href: string) {
    const full = base + href;
    return href === "" ? pathname === full : pathname === full || pathname.startsWith(full + "/");
  }

  return (
    <div className="flex min-h-dvh bg-slate-950 text-slate-100">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-e border-white/10 bg-slate-900 p-5 md:flex">
        <div className="mb-8 flex items-center gap-2.5 px-1">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-sky-500 to-turquoise-400 text-lg">🧭</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{dict.backoffice.brand}</p>
            <p className="truncate text-[11px] text-slate-400">{dict.backoffice.tagline}</p>
          </div>
        </div>

        <nav className="flex-1">
          <ul className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item.href);
              return (
                <li key={item.labelKey}>
                  <Link
                    href={base + item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                      active ? "bg-sky-500/15 text-sky-300" : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
                    )}
                  >
                    <span aria-hidden="true" className="text-base">
                      {item.icon}
                    </span>
                    {dict.backoffice[item.labelKey]}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="space-y-3 border-t border-white/10 pt-4">
          <p className="truncate px-3 text-xs text-slate-400">{adminName}</p>
          <Link href={`/${locale}`} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-slate-200">
            ← {dict.backoffice.backToApp}
          </Link>
        </div>
      </aside>

      <div className="flex min-h-dvh w-full flex-col">
        <header className="sticky top-0 z-10 border-b border-white/10 bg-slate-900/95 backdrop-blur md:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-sky-500 to-turquoise-400 text-base">🧭</span>
              <p className="text-sm font-semibold text-white">{dict.backoffice.brand}</p>
            </div>
            <Link href={`/${locale}`} className="text-xs font-medium text-slate-400">
              ← {dict.backoffice.backToApp}
            </Link>
          </div>
          <nav className="scrollbar-none flex gap-1.5 overflow-x-auto px-4 pb-3">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.labelKey}
                  href={base + item.href}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    active ? "bg-sky-500/20 text-sky-300" : "bg-white/5 text-slate-400",
                  )}
                >
                  <span aria-hidden="true">{item.icon}</span>
                  {dict.backoffice[item.labelKey]}
                </Link>
              );
            })}
          </nav>
        </header>

        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
