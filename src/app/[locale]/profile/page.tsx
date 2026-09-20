import Link from "next/link";
import { isLocale, type Locale } from "@/i18n/config";
import { notFound } from "next/navigation";
import { getDictionary } from "@/i18n/getDictionary";
import { getCurrentUser } from "@/lib/auth/session";
import { Card, Button } from "@/components/ui/primitives";
import { LogoutButton } from "@/components/auth/LogoutButton";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;
  const dict = await getDictionary(locale);
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-md space-y-4 px-4 py-10 text-center">
        <span className="text-3xl">🧳</span>
        <h1 className="text-lg font-semibold text-brand-950">{dict.profile.guestTitle}</h1>
        <p className="text-sm text-slate-600">{dict.profile.guestBody}</p>
        <div className="flex justify-center gap-3">
          <Link href={`/${locale}/login`}>
            <Button variant="secondary">{dict.nav.login}</Button>
          </Link>
          <Link href={`/${locale}/signup`}>
            <Button>{dict.nav.signup}</Button>
          </Link>
        </div>
      </div>
    );
  }

  const links = [
    { href: "/trips", label: dict.profile.yourTrips, icon: "🗺️" },
    { href: "/bookings", label: dict.profile.yourBookings, icon: "🧾" },
    { href: "/favorites", label: dict.profile.savedPlaces, icon: "🤍" },
    { href: "/provider", label: dict.nav.becomeProvider, icon: "🏪" },
    { href: "/settings", label: dict.profile.accountSettings, icon: "⚙️" },
  ];

  // Moderation is the one area with no other entry point in the product.
  if (user.role === "admin") {
    links.push({ href: "/admin", label: dict.admin.title, icon: "🛡️" });
  }

  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 py-6">
      <div className="flex items-center gap-3">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-brand-800 text-xl font-semibold text-white">
          {user.name.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <p className="text-lg font-semibold text-brand-950">{user.name}</p>
          <p className="text-sm text-slate-500">{user.email}</p>
        </div>
      </div>

      <div className="space-y-2">
        {links.map((link) => (
          <Link key={link.href} href={`/${locale}${link.href}`}>
            <Card className="flex items-center justify-between p-4 hover:shadow-[var(--shadow-elevated)]">
              <span className="flex items-center gap-3 text-sm font-medium text-brand-950">
                <span>{link.icon}</span> {link.label}
              </span>
              <span className="text-slate-400">→</span>
            </Card>
          </Link>
        ))}
      </div>

      <LogoutButton />
    </div>
  );
}
