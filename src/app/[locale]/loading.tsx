import { Skeleton } from "@/components/ui/feedback";

// Every page under [locale] is force-dynamic and queries PostgreSQL on each
// request, so navigation used to sit on the previous screen with no feedback
// until the server responded. This gives the router something to show
// immediately.
export default function LocaleLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-6" aria-busy="true" aria-live="polite">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-64" />
      <div className="space-y-3 pt-2">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}
