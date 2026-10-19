export type MapLocation = { latitude: number; longitude: number; countryCode?: string };

/** Empty/partial drafts never become a false (0, 0) marker when the map is opened. */
export function readMapLocation(latitude: string, longitude: string): MapLocation | null {
  if (!latitude.trim() || !longitude.trim()) return null;
  const point = { latitude: Number(latitude), longitude: Number(longitude) };
  return Number.isFinite(point.latitude) &&
    Math.abs(point.latitude) <= 90 &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.longitude) <= 180
    ? point
    : null;
}

/** Normalize Leaflet's wrapped world coordinates and retain a stable six-decimal draft value. */
export function selectedMapLocation(point: { lat: number; lng: number }): MapLocation {
  return {
    latitude: Number(Math.max(-85.051129, Math.min(85.051129, point.lat)).toFixed(6)),
    longitude: Number((((((point.lng + 180) % 360) + 360) % 360) - 180).toFixed(6)),
  };
}
