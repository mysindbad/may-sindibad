import { ExploreView } from "@/components/explore/ExploreView";

export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ city?: string }> }) {
  const { city } = await searchParams;
  return <ExploreView initialCity={city ?? "Marrakech"} />;
}
