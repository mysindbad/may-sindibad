export function hasCompleteCoordinatePair(
  lat: number | null | undefined,
  lng: number | null | undefined,
): boolean {
  const hasLat = lat !== null && lat !== undefined;
  const hasLng = lng !== null && lng !== undefined;
  return hasLat === hasLng;
}
