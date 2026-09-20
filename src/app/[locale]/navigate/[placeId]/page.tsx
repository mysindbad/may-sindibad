import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/getDictionary";
import { db } from "@/db";
import { places } from "@/db/schema";
import { NavigationView } from "@/components/navigation/NavigationView";

// "Take me there" lands here. The destination is resolved on the server so the
// coordinates come from our own approved data rather than from the URL.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; placeId: string }> }) {
  const { locale: rawLocale, placeId } = await params;
  if (!isLocale(rawLocale)) return {};
  const dict = await getDictionary(rawLocale);
  const [place] = await db.select({ name: places.name }).from(places).where(eq(places.id, placeId)).limit(1);
  return { title: place ? place.name + " · " + dict.navigation.title : dict.navigation.title };
}

export default async function NavigatePage({ params }: { params: Promise<{ locale: string; placeId: string }> }) {
  const { locale: rawLocale, placeId } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;
  void locale;

  const [place] = await db
    .select({
      id: places.id,
      name: places.name,
      city: places.city,
      country: places.country,
      address: places.address,
      lat: places.lat,
      lng: places.lng,
    })
    .from(places)
    .where(and(eq(places.id, placeId), eq(places.status, "approved")))
    .limit(1);

  if (!place) notFound();

  return <NavigationView place={place} />;
}
