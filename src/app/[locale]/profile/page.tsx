import Link from "next/link";
import { isLocale, type Locale } from "@/i18n/config";
import { notFound } from "next/navigation";
import { getDictionary } from "@/i18n/getDictionary";
import { getCurrentUser } from "@/lib/auth/session";
import { Card, Button } from "@/components/ui/primitives";
import { LogoutButton } from "@/components/auth/LogoutButton";

export const dynamic = "force-dynamic";

interface ProfileLink {
  href: string;
  label: string;
  icon: string;
  gradient: string;
}

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

  const planningLinks: ProfileLink[] = [
    { href: "/trips", label: dict.profile.yourTrips, icon: "🗺️", gradient: "from-sky-500 to-turquoise-400" },
    { href: "/bookings", label: dict.profile.yourBookings, icon: "🧾", gradient: "from-turquoise-500 to-lime-400" },
    { href: "/favorites", label: dict.profile.savedPlaces, icon: "🤍", gradient: "from-rose-500 to-pink-400" },
  ];

  const accountLinks: ProfileLink[] = [
    { href: "/provider", label: dict.nav.becomeProvider, icon: "🏪", gradient: "from-emerald-600 to-lime-400" },
    { href: "/settings", label: dict.profile.accountSettings, icon: "⚙️", gradient: "from-slate-600 to-slate-400" },
  ];

  // Moderation is the one area with no other entry point in the product.
  if (user.role === "admin") {
    accountLinks.push({ href: "/admin", label: dict.admin.title, icon: "🛡️", gradient: "from-violet-700 to-fuchsia-500" });
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-6">
      <div className="rounded-3xl bg-gradient-to-br from-brand-900 via-brand-800 to-sky-600 p-5 text-white shadow-[var(--shadow-elevated)] sm:p-6">
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-white/15 text-2xl font-semibold ring-2 ring-white/30 backdrop-blur-sm">
            {user.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{user.name}</p>
            <p className="truncate text-sm text-white/70">{user.email}</p>
          </div>
        </div>
      </div>

      <section className="space-y-2.5">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{dict.profile.planningSection}</h2>
        <div className="space-y-2">
          {planningLinks.map((link) => (
            <ProfileLinkCard key={link.href} locale={locale} link={link} />
          ))}
        </div>
      </section>

      <section className="space-y-2.5">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{dict.profile.accountSection}</h2>
        <div className="space-y-2">
          {accountLinks.map((link) => (
            <ProfileLinkCard key={link.href} locale={locale} link={link} />
          ))}
        </div>
      </section>

      <LogoutButton />

      <p className="pt-2 text-center text-xs text-slate-400">{dict.common.appName}</p>
    </div>
  );
}

function ProfileLinkCard({ locale, link }: { locale: string; link: ProfileLink }) {
  return (
    <Link href={`/${locale}${link.href}`}>
      <Card className="flex items-center gap-3 p-3.5 transition-shadow hover:shadow-[var(--shadow-elevated)]">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${link.gradient} text-lg text-white`}
        >
          {link.icon}
        </span>
        <span className="flex-1 text-sm font-medium text-brand-950">{link.label}</span>
        <span className="text-slate-400">→</span>
      </Card>
    </Link>
  );
}
