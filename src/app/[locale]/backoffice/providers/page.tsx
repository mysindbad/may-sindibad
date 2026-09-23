import { notFound } from "next/navigation";
import { desc, eq, inArray } from "drizzle-orm";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/getDictionary";
import { db } from "@/db";
import { providers } from "@/db/schema";
import { VerificationActions } from "@/components/backoffice/ModerationActions";
import { SectionTabs } from "@/components/backoffice/SectionTabs";

export const dynamic = "force-dynamic";

const TABS = ["pending", "verified", "suspended", "all"] as const;
type Tab = (typeof TABS)[number];

export default async function BackofficeProvidersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;
  const dict = await getDictionary(locale);

  const { status: rawStatus } = await searchParams;
  const tab: Tab = TABS.includes(rawStatus as Tab) ? (rawStatus as Tab) : "pending";

  const rows = await db
    .select()
    .from(providers)
    .where(
      tab === "pending"
        ? inArray(providers.verificationStatus, ["pending", "unverified"])
        : tab === "all"
          ? undefined
          : eq(providers.verificationStatus, tab),
    )
    .orderBy(desc(providers.createdAt))
    .limit(100);

  const tabLabel: Record<Tab, string> = {
    pending: dict.backoffice.statPendingProviders,
    verified: dict.admin.verify,
    suspended: dict.admin.suspend,
    all: dict.backoffice.allStatuses,
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-white">{dict.backoffice.navProviders}</h1>
      </div>

      <SectionTabs basePath={`/${locale}/backoffice/providers`} active={tab} tabs={TABS.map((value) => ({ value, label: tabLabel[value] }))} />

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-slate-900 p-4 text-sm text-slate-400">{dict.admin.noVerification}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((provider) => (
            <li key={provider.id} className="rounded-2xl border border-white/10 bg-slate-900 p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-white">{provider.name}</p>
                <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-slate-400">{provider.verificationStatus}</span>
              </div>
              <p className="text-xs text-slate-400">
                {provider.city}, {provider.country}
                {provider.phone ? " · " + provider.phone : ""}
              </p>
              {provider.description && <p className="mt-1 line-clamp-3 text-xs text-slate-300">{provider.description}</p>}
              <VerificationActions providerId={provider.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
