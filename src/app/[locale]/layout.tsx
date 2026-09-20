import type { Metadata, Viewport } from "next";
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
import { ServiceWorkerRegistration } from "@/components/system/ServiceWorkerRegistration";

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
    <html lang={locale} dir={dir}>
      <body className="antialiased">
        <LocaleProvider locale={locale} dict={dict} dir={dir}>
          <AuthProvider initialUser={user}>
            <TimezoneSync />
            <ServiceWorkerRegistration />
            <AppShell>{children}</AppShell>
          </AuthProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
