export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function nearestCity<T extends { lat: number; lng: number }>(point: { lat: number; lng: number }, cities: T[]): T | null {
  if (cities.length === 0) return null;
  return cities.reduce((closest, city) => (haversineKm(point, city) < haversineKm(point, closest) ? city : closest));
}


export interface GeoBoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  crossesAntimeridian: boolean;
}

function normalizeLongitude(value: number): number {
  return ((value + 180) % 360 + 360) % 360 - 180;
}

/**
 * Conservative latitude/longitude bounding box for a radius around a point.
 * The box is only a pre-filter; callers still apply haversine distance for the
 * exact circular radius. Handles polar regions and antimeridian crossing.
 */
export function boundingBoxForRadius(point: { lat: number; lng: number }, radiusKm: number): GeoBoundingBox {
  const safeLat = Math.min(90, Math.max(-90, point.lat));
  const safeLng = normalizeLongitude(point.lng);
  const safeRadius = Math.max(0, radiusKm);
  const latDelta = safeRadius / 111.32;
  const minLat = Math.max(-90, safeLat - latDelta);
  const maxLat = Math.min(90, safeLat + latDelta);

  // At/near a pole every longitude can fall within the radius.
  const cosLat = Math.cos((safeLat * Math.PI) / 180);
  if (minLat <= -90 || maxLat >= 90 || Math.abs(cosLat) < 1e-12) {
    return { minLat, maxLat, minLng: -180, maxLng: 180, crossesAntimeridian: false };
  }

  const lngDelta = Math.min(180, safeRadius / (111.32 * Math.abs(cosLat)));
  if (lngDelta >= 180) {
    return { minLat, maxLat, minLng: -180, maxLng: 180, crossesAntimeridian: false };
  }

  const rawMin = safeLng - lngDelta;
  const rawMax = safeLng + lngDelta;
  const crossesAntimeridian = rawMin < -180 || rawMax > 180;
  return {
    minLat,
    maxLat,
    minLng: normalizeLongitude(rawMin),
    maxLng: normalizeLongitude(rawMax),
    crossesAntimeridian,
  };
}
