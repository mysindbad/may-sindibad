import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getDictionary } from "@/i18n/getDictionary";
import { EmptyState } from "@/components/ui/feedback";
import { AdminShell } from "@/components/backoffice/AdminShell";

export const dynamic = "force-dynamic";

export default async function ControlRoomDashboardLayout({ children }: { children: ReactNode }) {
  const [dict, user] = await Promise.all([getDictionary("ar"), getCurrentUser()]);

  if (!user) redirect("/control-room/login");

  if (user.role !== "admin") {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md items-center px-4">
        <EmptyState icon="🔒" title={dict.admin.adminOnly} body={dict.errors.forbidden} />
      </div>
    );
  }

  return <AdminShell adminName={user.name + " · " + user.email}>{children}</AdminShell>;
}
