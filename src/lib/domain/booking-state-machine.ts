// Pure booking lifecycle rules. Kept free of DB/framework imports so the
// transition table itself is unit-testable and reusable from API routes.
export type BookingStatus =
  | "draft"
  | "pending"
  | "awaiting_payment"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "refunded";

const ALLOWED_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  draft: ["pending", "cancelled"],
  pending: ["awaiting_payment", "confirmed", "cancelled"],
  awaiting_payment: ["confirmed", "cancelled", "pending"],
  confirmed: ["completed", "cancelled"],
  cancelled: [],
  completed: ["refunded"],
  refunded: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  if (from === to) return false;
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: BookingStatus, to: BookingStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid booking transition: ${from} -> ${to}`);
  }
}

export function isTerminal(status: BookingStatus): boolean {
  return ALLOWED_TRANSITIONS[status].length === 0;
}
