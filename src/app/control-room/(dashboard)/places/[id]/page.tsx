import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { places } from "@/db/schema";
import { getDictionary } from "@/i18n/getDictionary";
import { PlaceEditor, type EditorStatus } from "@/components/backoffice/places/PlaceEditor";
import { loadEditorCategories } from "@/components/backoffice/places/categories";
import { isUploadStorageConfigured } from "@/lib/storage";

export const dynamic = "force-dynamic";

export const metadata = { title: "تعديل المكان" };

export default async function EditPlacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;
  if (!z.string().uuid().safeParse(id).success) notFound();

  const [place] = await db.select().from(places).where(eq(places.id, id)).limit(1);
  if (!place) notFound();

  const dict = await getDictionary("ar");
  const categories = await loadEditorCategories(dict);

  return (
    <PlaceEditor
      place={{
        id: place.id,
        name: place.name,
        description: place.description,
        categoryId: place.categoryId,
        city: place.city,
        country: place.country,
        address: place.address,
        lat: place.lat,
        lng: place.lng,
        priceLevel: place.priceLevel,
        coverImageUrl: place.coverImageUrl,
        status: place.status as EditorStatus,
      }}
      categories={categories}
      uploadsEnabled={isUploadStorageConfigured()}
      justCreated={saved === "1"}
    />
  );
}
