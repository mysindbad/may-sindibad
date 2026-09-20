import "server-only";
import type { Locale } from "./config";
import type { Dictionary } from "./dictionaries/en";

const loaders: Record<Locale, () => Promise<{ default: Dictionary }>> = {
  en: () => import("./dictionaries/en"),
  ar: () => import("./dictionaries/ar"),
  fr: () => import("./dictionaries/fr"),
  es: () => import("./dictionaries/es"),
  de: () => import("./dictionaries/de"),
  ru: () => import("./dictionaries/ru"),
};

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  const loader = loaders[locale] ?? loaders.en;
  const mod = await loader();
  return mod.default;
}
