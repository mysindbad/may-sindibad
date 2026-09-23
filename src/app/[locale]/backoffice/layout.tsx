import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { isLocale, type Locale } from "@/i18n/config";
import { getCurrentUser } from "@/lib/auth/session";
import { buildLoginPath } from "@/lib/auth/return-path";
import { EmptyState } from "@/components/ui/feedback";
import { AdminShell } from "@/components/backoffice/AdminShell";
import { getDictionary } from "@/i18n/getDictionary";

export const dynamic = "force-dynamic";

// A separate manifest/icon identity so "add to home screen" here installs a
// second, distinct app (its own icon and name) instead of just being a page
// inside the already-installed traveller app - the two are different tools
// for different people and should never share one home-screen icon.
export const metadata: Metadata = {
  title: "لوحة الإدارة",
  manifest: "/backoffice-manifest.webmanifest",
  icons: {
    icon: "/icons/admin-dashboard-192.png",
    apple: "/icons/admin-dashboard-192.png",
  },
  appleWebApp: {
    capable: true,
    title: "لوحة الإدارة",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#020617",
};

// One gate for the entire dashboard, checked once here rather than repeated
// on every sub-page - a page under backoffice/ never has to think about auth.
export default async function BackofficeLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;
  const dict = await getDictionary(locale);

  const user = await getCurrentUser();
  if (!user) redirect(buildLoginPath(locale, `/${locale}/backoffice`));
  if (user.role !== "admin") {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <EmptyState icon="🔒" title={dict.admin.adminOnly} body={dict.errors.forbidden} />
      </div>
    );
  }

  return <AdminShell adminName={user.name + " · " + user.email}>{children}</AdminShell>;
}
