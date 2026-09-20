import { Badge } from "@/components/ui/primitives";
import type { Dictionary } from "@/i18n/dictionaries/en";

const TONE = {
  draft: "neutral",
  planned: "sky",
  active: "lime",
  completed: "brand",
  cancelled: "danger",
} as const;

export function TripStatusBadge({ status, dict }: { status: keyof typeof TONE; dict: Dictionary }) {
  const key = `status${status.charAt(0).toUpperCase()}${status.slice(1)}` as keyof Dictionary["trips"];
  return <Badge tone={TONE[status]}>{dict.trips[key]}</Badge>;
}
