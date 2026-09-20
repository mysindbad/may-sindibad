/** Strict 24-hour wall-clock value used by itinerary data. */
export function isValidClockTime(value: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}
