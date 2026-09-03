import type { Level } from '../types';

export const YEAR_MIN = 1965;
export const YEAR_MAX = 2016;

export const COLORS = {
  eq: { low: '#ffbb00', medium: '#fb6542', high: '#ff0000' } as Record<Level, string>,
  tsu: { low: '#9999ff', medium: '#6666ff', high: '#0000ff' } as Record<Level, string>,
  forecast: '#3ddc84',
  forecastDark: '#0d5c33',
  forecastLight: '#c8ffdc',
  actual: '#ffffff',
  map: '#3b3b55',
  globe: '#6e6d95',
  bg: 'rgb(20, 20, 30)',
};

export const LEVEL_LABELS: Record<Level, string> = { low: '≤ 6.0', medium: '6.0 – 6.5', high: '> 6.5' };
export const INTENSITY_LABELS: Record<Level, string> = { low: '≤ 2', medium: '2 – 4', high: '> 4' };

/** Magnitude classes used consistently across all pages. */
export function magnitudeLevel(mag: number): Level {
  if (mag <= 6) return 'low';
  if (mag <= 6.5) return 'medium';
  return 'high';
}

/** Tsunami intensity classes (Soloviev-Imamura scale, absolute value). */
export function intensityLevel(intensity: number | null): Level {
  if (intensity === null) return 'low';
  if (intensity <= 2) return 'low';
  if (intensity <= 4) return 'medium';
  return 'high';
}

/** Radius in px at a reference map width of 1440px, scaled by `scale`. */
export function magnitudeRadius(mag: number, style: 'dense' | 'yearly', scale = 1): number {
  const level = magnitudeLevel(mag);
  const table = style === 'dense' ? { low: 1.8, medium: 2.8, high: 4.6 } : { low: 4, medium: 7, high: 11 };
  return table[level] * scale;
}

export function intensityRadius(intensity: number | null, style: 'dense' | 'yearly', scale = 1): number {
  const level = intensityLevel(intensity);
  const table = style === 'dense' ? { low: 4, medium: 5, high: 6.5 } : { low: 8, medium: 12, high: 17 };
  return table[level] * scale;
}

/** Predicted (sampled) magnitude → green shade: dark for M 5.5, light for M 8+. */
export function forecastColor(mag: number): string {
  const c = forecastRgb(mag);
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Same gradient as 0-255 RGB components. */
export function forecastRgb(mag: number): [number, number, number] {
  const t = Math.min(1, Math.max(0, (mag - 5.5) / 2.5));
  const a = hexToRgb(COLORS.forecastDark);
  const b = hexToRgb(COLORS.forecastLight);
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as [number, number, number];
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Equirectangular projection to the unit square. */
export const lonToX = (lon: number) => (lon + 180) / 360;
export const latToY = (lat: number) => (90 - lat) / 180;

/**
 * DoubleMap.svg (the Overview map) is an equirectangular drawing of two worlds side by side,
 * 720 × 347.25 units per world, but it does not span the full ±90° of latitude. The bounds
 * below were measured by cross-correlating it with the full equirectangular map.
 */
export const DOUBLE_MAP = { worldWidth: 720, worldHeight: 347.25, latTop: 83.5, latBottom: -90 };
export const doubleMapLatToY = (lat: number) => (DOUBLE_MAP.latTop - lat) / (DOUBLE_MAP.latTop - DOUBLE_MAP.latBottom);

/** Legacy dot sizes on the Overview page: fixed pixel diameters 2.2 / 3.1 / 5.1 and 8 for tsunamis. */
export const OVERVIEW_RADIUS: Record<Level, number> = { low: 1.1, medium: 1.55, high: 2.5 };
export const OVERVIEW_TSUNAMI_RADIUS = 4;

export function formatDate(y: number, m: number | null, d: number | null): string {
  const mm = m === null ? '??' : String(m).padStart(2, '0');
  const dd = d === null ? '??' : String(d).padStart(2, '0');
  return `${dd}.${mm}.${y}`;
}

export function formatIsoDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/** Fit a 2:1 map into a W×H box ("contain"), centred. */
export function fitMap(width: number, height: number, fill: 'contain' | 'width' = 'contain') {
  let w = width;
  let h = width / 2;
  if (fill === 'contain' && h > height) {
    h = height;
    w = height * 2;
  }
  if (fill === 'width' && h > height) {
    // allow overflow vertically but keep centred
  }
  return { x: (width - w) / 2, y: (height - h) / 2, w, h };
}
