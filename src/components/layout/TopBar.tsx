"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "@/i18n/LocaleProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { BrandMark } from "@/components/brand/BrandMark";

const AUTH_PATH_PATTERN = /^\/[a-z]{2}\/(login|signup)(\/|$)/;

export function TopBar() {
  const { locale, dict } = useLocale();
  const { user } = useAuth();
  const pathname = usePathname();
  const isAuthPage = AUTH_PATH_PATTERN.test(pathname);

  return (
    <header className="safe-top sticky top-0 z-30 flex items-center justify-between border-b border-brand-900/8 bg-white/90 px-4 py-3 backdrop-blur md:hidden dark:border-white/10 dark:bg-brand-950/90">
      <Link href={`/${locale}`} className="flex items-center gap-2">
        <BrandMark className="h-8 w-8 rounded-lg object-cover" />
        <span className="text-base font-semibold text-brand-950 dark:text-sand-50">{dict.common.appName}</span>
      </Link>
      {user ? (
        <Link href={`/${locale}/profile`} aria-label={dict.nav.profile}>
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote avatar comes from arbitrary S3/local hosts, not the local image loader's fixed domain list.
            <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover ring-1 ring-brand-900/10 dark:ring-white/15" />
          ) : (
            <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-800 text-xs font-semibold text-white">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
          )}
        </Link>
      ) : isAuthPage ? null : (
        <Link href={`/${locale}/login`} className="rounded-lg bg-brand-800 px-3 py-1.5 text-xs font-medium text-white">
          {dict.nav.login}
        </Link>
      )}
    </header>
  );
}
