"use client";

import { useRouter } from "next/navigation";
import { useLocale } from "@/i18n/LocaleProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { ConfirmButton } from "@/components/ui/feedback";

export function LogoutButton() {
  const { dict, locale } = useLocale();
  const { logout } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    const loggedOut = await logout();
    if (!loggedOut) {
      router.refresh();
      return;
    }
    router.push(`/${locale}`);
    router.refresh();
  }

  return (
    <ConfirmButton
      label={dict.nav.logout}
      confirmLabel={dict.auth.logoutConfirm}
      onConfirm={handleLogout}
      variant="secondary"
      className="w-full"
    />
  );
}
