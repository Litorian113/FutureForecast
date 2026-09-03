import type { Tsunami } from '../types';

const EARTH_RADIUS_KM = 6371;

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/**
 * Rough place label for a coordinate, using the NOAA tsunami records (which carry location and
 * country names) as an offline gazetteer. Good enough for subduction zones, where nearly all
 * large quakes happen; remote spots get a distance hint.
 */
export function nearestPlace(lat: number, lon: number, tsunamis: Tsunami[]): string {
  let best: Tsunami | null = null;
  let bestKm = Infinity;
  for (const t of tsunamis) {
    const d = haversineKm(lat, lon, t.lat, t.lon);
    if (d < bestKm) {
      bestKm = d;
      best = t;
    }
  }
  if (!best) return `${lat.toFixed(1)}°, ${lon.toFixed(1)}°`;
  const name = titleCase(best.location || best.country || best.region);
  const country = best.country && best.country !== best.location ? `, ${titleCase(best.country)}` : '';
  if (bestKm > 800) return `remote, ${Math.round(bestKm)} km from ${name}${country}`;
  return bestKm < 60 ? `${name}${country}` : `${Math.round(bestKm)} km from ${name}${country}`;
}

const KEEP_UPPER = new Set(['USA', 'UK', 'US', 'PNG', 'NZ', 'SW', 'NE', 'NW', 'SE', 'S', 'N', 'E', 'W']);

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/(\s+|,|-|\.)/)
    .map((w) => (KEEP_UPPER.has(w.toUpperCase()) ? w.toUpperCase() : w.length > 1 ? w[0].toUpperCase() + w.slice(1) : w.toUpperCase()))
    .join('');
}
