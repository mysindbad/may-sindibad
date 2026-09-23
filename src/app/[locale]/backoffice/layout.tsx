import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { isLocale, type Locale } from "@/i18n/config";
import { getCurrentUser } from "@/lib/auth/session";
import { buildLoginPath } from "@/lib/auth/return-path";
import { EmptyState } from "@/components/ui/feedback";
import { AdminShell } from "@/components/backoffice/AdminShell";
import { getDictionary } from "@/i18n/getDictionary";

export const dynamic = "force-dynamic";

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
