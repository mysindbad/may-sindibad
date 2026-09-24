import Link from "next/link";
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
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_TONE = { pending: "sun", approved: "lime", rejected: "danger", flagged: "danger" } as const;
const STATUS_KEY = { pending: "statusPending", approved: "statusApproved", rejected: "statusRejected", flagged: "statusFlagged" } as const;

export default async function CommunityPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;
  const [dict, user, { tab: rawTab }] = await Promise.all([getDictionary(locale), getCurrentUser(), searchParams]);
  const tab: "posts" | "places" = rawTab === "places" ? "places" : "posts";

  const rows =
    tab === "places"
      ? await db
          .select()
          .from(contributions)
          .where(inArray(contributions.status, ["pending", "approved"]))
          .orderBy(desc(contributions.createdAt))
          .limit(20)
      : [];

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold text-brand-950 dark:text-sand-50">{dict.community.title}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">{dict.community.subtitle}</p>
      </div>

      {/* Stories are their own highlights strip, always visible above whichever
          tab is open - a moment that disappears in 24h reads as a different
          kind of thing than the two tabs below it, which don't. */}
      <div className="-mx-4 border-b border-brand-900/8 px-4 pb-4 dark:border-white/10">
        <StoryTray />
      </div>

      {/* Two different tools were sharing one endless page: a social feed and
          a place-suggestion workflow with its own moderation state. Tabs give
          each its own room instead of the traveller scrolling through a form
          and a confirmations list to get back to posts, or the other way. */}
      <div className="flex gap-1.5 rounded-full bg-slate-100 p-1 dark:bg-white/5">
        <Link
          href={`/${locale}/community`}
          className={cn(
            "flex-1 rounded-full px-4 py-2 text-center text-sm font-semibold transition-colors",
            tab === "posts" ? "bg-white text-brand-950 shadow-sm dark:bg-brand-900 dark:text-sand-50" : "text-slate-500 dark:text-slate-400",
          )}
        >
          {dict.communityFeed.title}
        </Link>
        <Link
          href={`/${locale}/community?tab=places`}
          className={cn(
            "flex-1 rounded-full px-4 py-2 text-center text-sm font-semibold transition-colors",
            tab === "places" ? "bg-white text-brand-950 shadow-sm dark:bg-brand-900 dark:text-sand-50" : "text-slate-500 dark:text-slate-400",
          )}
        >
          {dict.community.contribute}
        </Link>
      </div>

      {tab === "posts" ? (
        <CommunityFeed />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">{dict.community.contributeIntro}</p>

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
        </div>
      )}
    </div>
  );
}
