import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { ControlRoomLoginForm } from "@/components/control-room/LoginForm";

export const dynamic = "force-dynamic";

export default async function ControlRoomLoginPage() {
  const user = await getCurrentUser();
  if (user?.role === "admin") redirect("/control-room");

  return <ControlRoomLoginForm />;
}
