import { Badge } from "@/components/ui/primitives";
import type { Dictionary } from "@/i18n/dictionaries/en";

const TONE = {
  draft: "neutral",
  pending: "sun",
  awaiting_payment: "sky",
  confirmed: "lime",
  cancelled: "danger",
  completed: "brand",
  refunded: "neutral",
} as const;

const KEY = {
  draft: "statusDraft",
  pending: "statusPending",
  awaiting_payment: "statusAwaitingPayment",
  confirmed: "statusConfirmed",
  cancelled: "statusCancelled",
  completed: "statusCompleted",
  refunded: "statusRefunded",
} as const;

export function BookingStatusBadge({ status, dict }: { status: keyof typeof TONE; dict: Dictionary }) {
  return <Badge tone={TONE[status]}>{dict.bookings[KEY[status]]}</Badge>;
}
