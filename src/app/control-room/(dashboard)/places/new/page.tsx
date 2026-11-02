import { getDictionary } from "@/i18n/getDictionary";
import { PlaceEditor } from "@/components/backoffice/places/PlaceEditor";
import { loadEditorCategories } from "@/components/backoffice/places/categories";
import { isUploadStorageConfigured } from "@/lib/storage";

export const dynamic = "force-dynamic";

export const metadata = { title: "مكان جديد" };

export default async function NewPlacePage() {
  const dict = await getDictionary("ar");
  const categories = await loadEditorCategories(dict);
  return <PlaceEditor place={null} categories={categories} uploadsEnabled={isUploadStorageConfigured()} />;
}
