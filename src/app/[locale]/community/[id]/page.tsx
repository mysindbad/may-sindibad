import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/getDictionary";
import { getCurrentUser } from "@/lib/auth/session";
import { getCommunityPostById } from "@/lib/data/community";
import { SinglePostView } from "@/components/community/SinglePostView";

export const dynamic = "force-dynamic";

export default async function CommunityPostPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: rawLocale, id } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;
  const [dict, user] = await Promise.all([getDictionary(locale), getCurrentUser()]);

  const post = await getCommunityPostById(id, user?.id ?? null);
  if (!post) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <Link href={`/${locale}/community`} className="text-sm font-medium text-sky-600">
        ← {dict.communityFeed.title}
      </Link>
      <SinglePostView initialPost={post} />
    </div>
  );
}
