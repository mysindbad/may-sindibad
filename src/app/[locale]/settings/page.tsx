import { isLocale, type Locale } from "@/i18n/config";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { buildLoginPath } from "@/lib/auth/return-path";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { SindbadMemoryPanel } from "@/components/settings/SindbadMemoryPanel";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;

  const user = await getCurrentUser();
  if (!user) redirect(buildLoginPath(locale, `/${locale}/settings`));

  return (
    <>
      <SettingsForm user={user} />
      {/* What Sindbad has learned lives with the other account controls, where
          a traveller can read it and erase it. */}
      <div className="mx-auto max-w-lg px-4 pb-8">
        <SindbadMemoryPanel />
      </div>
    </>
  );
}
