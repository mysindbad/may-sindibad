const GUEST_ID_PATTERN = /^guest_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidGuestId(value: string | null | undefined): value is string {
  return typeof value === "string" && GUEST_ID_PATTERN.test(value);
}
