import { desc, or, ilike } from "drizzle-orm";
import { getDictionary } from "@/i18n/getDictionary";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/db";
import { users } from "@/db/schema";
import { RoleSelect } from "@/components/backoffice/ModerationActions";
import { formatDateRange } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ControlRoomUsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const dict = await getDictionary("ar");
  const [viewer, { q }] = await Promise.all([getCurrentUser(), searchParams]);
  const query = q?.trim() ?? "";

  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, createdAt: users.createdAt })
    .from(users)
    .where(query ? or(ilike(users.name, `%${query}%`), ilike(users.email, `%${query}%`)) : undefined)
    .orderBy(desc(users.createdAt))
    .limit(100);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-white">{dict.backoffice.navUsers}</h1>
      </div>

      <form method="GET" className="relative">
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder={dict.backoffice.searchPlaceholder}
          className="w-full rounded-xl border border-white/10 bg-slate-900 py-2.5 ps-4 pe-11 text-sm text-white outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-sky-500/40"
        />
        <button type="submit" aria-label={dict.common.search} className="absolute inset-y-0 end-0 flex items-center pe-3.5 text-slate-500">
          🔍
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-slate-900 p-4 text-sm text-slate-400">{dict.backoffice.noUsersFound}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((user) => (
            <li key={user.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900 p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{user.name}</p>
                <p className="truncate text-xs text-slate-400">{user.email}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {dict.backoffice.joined}: {formatDateRange(user.createdAt.toISOString().slice(0, 10), user.createdAt.toISOString().slice(0, 10), "ar")}
                </p>
              </div>
              <RoleSelect userId={user.id} currentRole={user.role} isSelf={viewer?.id === user.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
