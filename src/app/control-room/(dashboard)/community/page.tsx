import { desc, eq } from "drizzle-orm";
import { getDictionary } from "@/i18n/getDictionary";
import { db } from "@/db";
import { communityPosts, users } from "@/db/schema";
import { CommunityPostActions } from "@/components/backoffice/ModerationActions";

export const dynamic = "force-dynamic";

export default async function ControlRoomCommunityPage() {
  const dict = await getDictionary("ar");

  const rows = await db
    .select({
      id: communityPosts.id,
      kind: communityPosts.kind,
      body: communityPosts.body,
      createdAt: communityPosts.createdAt,
      authorName: users.name,
    })
    .from(communityPosts)
    .innerJoin(users, eq(communityPosts.userId, users.id))
    .where(eq(communityPosts.status, "published"))
    .orderBy(desc(communityPosts.createdAt))
    .limit(100);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-white">{dict.backoffice.navCommunity}</h1>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-slate-900 p-4 text-sm text-slate-400">{dict.backoffice.noCommunityPosts}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((post) => (
            <li key={post.id} className="rounded-2xl border border-white/10 bg-slate-900 p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-white">{post.authorName}</p>
                <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-slate-400">{post.kind}</span>
              </div>
              <p className="mt-1 line-clamp-3 text-xs text-slate-300">{post.body}</p>
              <CommunityPostActions postId={post.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
