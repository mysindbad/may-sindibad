import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import type { ReactNode } from "react";
import "../globals.css";
import { getDictionary } from "@/i18n/getDictionary";
import { LocaleProvider } from "@/i18n/LocaleProvider";

const sindbadFont = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sindbad",
  display: "swap",
});

// Deliberately its own root layout, not a page under [locale]/ - the
// dashboard is a separate tool for a different audience (one admin, not
// every traveller), so it gets its own <html>, its own login, its own
// installable identity, and no link anywhere in the traveller app points
// to it. Reachable only by knowing this URL directly. The actual admin
// gate (session + role) lives one level down in (dashboard)/layout.tsx,
// which is a route group sibling of login/ so a logged-out visit to the
// dashboard can redirect to /control-room/login without that redirect
// itself being inside the gate it's escaping.
export const metadata: Metadata = {
  title: { default: "لوحة الإدارة", template: "%s · لوحة الإدارة" },
  description: "لوحة تحكم المشرف لتطبيق ماي سندباد.",
  manifest: "/control-room-manifest.webmanifest",
  icons: {
    icon: "/icons/admin-dashboard-192.png",
    apple: "/icons/admin-dashboard-192.png",
  },
  appleWebApp: {
    capable: true,
    title: "لوحة الإدارة",
    statusBarStyle: "black-translucent",
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#020617",
  viewportFit: "cover",
};

export const dynamic = "force-dynamic";

export default async function ControlRoomLayout({ children }: { children: ReactNode }) {
  const dict = await getDictionary("ar");

  return (
    <html lang="ar" dir="rtl" className={sindbadFont.variable}>
      <body className="bg-slate-950 antialiased">
        <LocaleProvider locale="ar" dict={dict} dir="rtl">
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
