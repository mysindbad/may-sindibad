"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { locales, localeNames } from "@/i18n/config";
import { useLocale } from "@/i18n/LocaleProvider";

export function LocaleSwitcher() {
  const { locale } = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function switchTo(next: string) {
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000`;
    const rest = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, "");
    router.push(`/${next}${rest}`);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-sm font-medium text-brand-900 hover:bg-slate-50"
        aria-expanded={open}
      >
        <span aria-hidden="true">🌐</span> {locale.toUpperCase()}
      </button>
      {open && (
        <ul className="absolute end-0 z-50 mt-1 w-40 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-[var(--shadow-elevated)]">
          {locales.map((code) => (
            <li key={code}>
              <button
                type="button"
                aria-pressed={code === locale}
                onClick={() => switchTo(code)}
                className="flex w-full items-center justify-between px-3 py-2 text-start text-sm hover:bg-slate-50"
              >
                {localeNames[code]}
                {code === locale && <span aria-hidden="true" className="text-sky-500">✓</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
