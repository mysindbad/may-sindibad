import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import "../globals.css";
import { isLocale, isRtl, locales, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/getDictionary";
import { LocaleProvider } from "@/i18n/LocaleProvider";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { AppShell } from "@/components/layout/AppShell";
import { getCurrentUser } from "@/lib/auth/session";
import { TimezoneSync } from "@/components/system/TimezoneSync";
import { ThemeSync } from "@/components/system/ThemeSync";
import { ServiceWorkerRegistration } from "@/components/system/ServiceWorkerRegistration";

// Runs before hydration so the right theme paints immediately instead of
// flashing light first. Mirrors ThemeSync's logic: a stored "light"/"dark"
// choice wins, otherwise it falls back to local time (dark 7pm-6am).
const THEME_INIT_SCRIPT = `(function(){try{var pref=window.localStorage.getItem('sindbad_theme');var isDark;if(pref==='dark')isDark=true;else if(pref==='light')isDark=false;else{var h=new Date().getHours();isDark=h<6||h>=19;}if(isDark)document.documentElement.classList.add('dark');}catch(e){}})();`;

// A single elegant type family for the whole app, Arabic and Latin alike -
// one consistent look instead of each OS/browser falling back to whatever
// generic Arabic font it happens to ship with.
const sindbadFont = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sindbad",
  display: "swap",
});

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  applicationName: "My Sindbad",
  title: { default: "My Sindbad — AI Travel Companion", template: "%s · My Sindbad" },
  description: "Plan, navigate, book and discover your trips with Sindbad AI — one coherent travel companion.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/my-sindbad-192.png",
    apple: "/icons/my-sindbad-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b3552",
  viewportFit: "cover",
};

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;

  const [dict, user] = await Promise.all([getDictionary(locale), getCurrentUser()]);
  const dir = isRtl(locale) ? "rtl" : "ltr";

  return (
    <html lang={locale} dir={dir} className={sindbadFont.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="antialiased">
        <LocaleProvider locale={locale} dict={dict} dir={dir}>
          <AuthProvider initialUser={user}>
            <TimezoneSync />
            <ThemeSync />
            <ServiceWorkerRegistration />
            <AppShell>{children}</AppShell>
          </AuthProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
