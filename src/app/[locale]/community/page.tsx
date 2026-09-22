import { isLocale, type Locale } from "@/i18n/config";
import { notFound } from "next/navigation";
import { getDictionary } from "@/i18n/getDictionary";
import { getCurrentUser } from "@/lib/auth/session";
import { desc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { contributions } from "@/db/schema";
import { Badge, Card } from "@/components/ui/primitives";
import { ContributeForm } from "@/components/community/ContributeForm";
import { ConfirmContributionButton } from "@/components/community/ConfirmContributionButton";
import { CommunityFeed } from "@/components/community/CommunityFeed";
import { StoryTray } from "@/components/community/StoryTray";
import { trustLabel } from "@/lib/domain/community-trust";

export const dynamic = "force-dynamic";

const STATUS_TONE = { pending: "sun", approved: "lime", rejected: "danger", flagged: "danger" } as const;
const STATUS_KEY = { pending: "statusPending", approved: "statusApproved", rejected: "statusRejected", flagged: "statusFlagged" } as const;

export default async function CommunityPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;
  const dict = await getDictionary(locale);
  const user = await getCurrentUser();

  const rows = await db
    .select()
    .from(contributions)
    .where(inArray(contributions.status, ["pending", "approved"]))
    .orderBy(desc(contributions.createdAt))
    .limit(20);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold text-brand-950 dark:text-sand-50">{dict.community.title}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">{dict.community.subtitle}</p>
      </div>

      <StoryTray />

      {/* Travel moments, tips and place recommendations that other travellers
          can act on straight away. */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-brand-950 dark:text-sand-50">{dict.communityFeed.title}</h2>
        <CommunityFeed />
      </section>

      <hr className="border-t border-brand-900/8 dark:border-white/10" />

      {/* A separate, structured system from the feed above: suggesting a new
          place for the directory, and confirming what other travellers have
          already suggested. Grouped under one heading so it reads as its own
          part of the page instead of a form and a list that just happen to
          be stacked here. */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-brand-950 dark:text-sand-50">{dict.community.contribute}</h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{dict.community.contributeIntro}</p>
        </div>

        <ContributeForm />

        <div>
          <h3 className="mb-3 text-sm font-semibold text-brand-900 dark:text-slate-200">{dict.community.recentContributions}</h3>
          <ul className="space-y-2">
            {rows.map((c) => {
              const payload = c.payload as Record<string, unknown>;
              const name = typeof payload.name === "string" ? payload.name : "Suggested update";
              return (
                <li key={c.id}>
                  <Card className="flex items-center justify-between p-3">
                    <div>
                      <p className="text-sm font-semibold text-brand-950 dark:text-sand-50">{name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {trustLabel(c.status)} · {c.confirmationsCount} confirmation{c.confirmationsCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={STATUS_TONE[c.status]}>{dict.community[STATUS_KEY[c.status]]}</Badge>
                      {user && c.status === "pending" && <ConfirmContributionButton contributionId={c.id} disabled={c.submittedByUserId === user.id} />}
                    </div>
                  </Card>
                </li>
              );
            })}
            {rows.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">{dict.community.noContributions}</p>}
          </ul>
        </div>
      </section>
    </div>
  );
}
