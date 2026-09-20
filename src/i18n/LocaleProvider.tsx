"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Locale } from "./config";
import type { Dictionary } from "./dictionaries/en";

interface LocaleContextValue {
  locale: Locale;
  dict: Dictionary;
  dir: "ltr" | "rtl";
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  locale,
  dict,
  dir,
  children,
}: {
  locale: Locale;
  dict: Dictionary;
  dir: "ltr" | "rtl";
  children: ReactNode;
}) {
  const value = useMemo(() => ({ locale, dict, dir }), [locale, dict, dir]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used inside <LocaleProvider>");
  return ctx;
}

/** Convenience hook returning just the dictionary for the active locale. */
export function useDictionary(): Dictionary {
  return useLocale().dict;
}
