"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "@/i18n/LocaleProvider";
import { NAV_ITEMS } from "./nav-items";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const { locale, dict } = useLocale();
  const pathname = usePathname();

  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-brand-900/8 bg-white/95 backdrop-blur md:hidden dark:border-white/10 dark:bg-brand-950/95">
      <ul className="mx-auto flex max-w-xl items-stretch justify-between px-2">
        {NAV_ITEMS.map((item) => {
          const href = `/${locale}${item.href}`;
          const isActive = pathname === href || (item.href !== "" && pathname.startsWith(href));
          return (
            <li key={item.key} className="flex-1">
              <Link
                href={href}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors",
                  isActive ? "text-brand-800 dark:text-sky-300" : "text-slate-400 dark:text-slate-500",
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <span aria-hidden="true" className={cn("text-lg leading-none", isActive && "scale-110")}>{item.icon}</span>
                {dict.nav[item.key]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
