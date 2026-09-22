"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { locales, localeNames } from "@/i18n/config";
import { useLocale } from "@/i18n/LocaleProvider";
import { Label, Select, Button } from "@/components/ui/primitives";
import { readThemePreference, setThemePreference, type ThemePreference } from "@/components/system/ThemeSync";

const THEME_OPTIONS: ThemePreference[] = ["auto", "light", "dark"];

export function AppearanceSettings() {
  const { dict, locale } = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [theme, setTheme] = useState<ThemePreference>("auto");

  useEffect(() => {
    setTheme(readThemePreference());
  }, []);

  function switchLocale(next: string) {
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000`;
    const rest = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, "");
    router.push(`/${next}${rest}`);
  }

  function pickTheme(preference: ThemePreference) {
    setTheme(preference);
    setThemePreference(preference);
  }

  const THEME_LABEL: Record<ThemePreference, string> = {
    auto: dict.settings.themeAuto,
    light: dict.settings.themeLight,
    dark: dict.settings.themeDark,
  };

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-brand-900 dark:text-slate-200">{dict.settings.appearance}</h2>
      <div>
        <Label htmlFor="settings-language">{dict.settings.language}</Label>
        <Select id="settings-language" value={locale} onChange={(e) => switchLocale(e.target.value)}>
          {locales.map((code) => (
            <option key={code} value={code}>
              {localeNames[code]}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex gap-2">
        {THEME_OPTIONS.map((option) => (
          <Button
            key={option}
            type="button"
            size="sm"
            variant={theme === option ? "primary" : "secondary"}
            onClick={() => pickTheme(option)}
          >
            {THEME_LABEL[option]}
          </Button>
        ))}
      </div>
    </div>
  );
}
