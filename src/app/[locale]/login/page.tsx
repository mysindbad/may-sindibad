import { AuthForm } from "@/components/auth/AuthForm";
import { isLocale } from "@/i18n/config";
import { googleAuthConfigured } from "@/lib/auth/google";
import { sanitizeReturnPath } from "@/lib/auth/return-path";
import { notFound } from "next/navigation";

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string; authError?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const query = await searchParams;
  return (
    <AuthForm
      mode="login"
      googleEnabled={googleAuthConfigured()}
      nextPath={sanitizeReturnPath(query.next, `/${locale}`)}
      authError={query.authError ?? null}
    />
  );
}
