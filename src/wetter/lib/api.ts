import type { ForecastResponse, GeoHit } from '../types';

export class ServerDown extends Error {}

async function get<T>(url: string): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url);
  } catch {
    throw new ServerDown('server unreachable');
  }
  if (r.status === 502 || r.status === 504) throw new ServerDown('server unreachable');
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return (await r.json()) as T;
}

export const geocode = (q: string) => get<GeoHit[]>(`/api/geocode?q=${encodeURIComponent(q)}`);

export const fetchForecast = (hit: Pick<GeoHit, 'lat' | 'lon' | 'name' | 'country'>) =>
  get<ForecastResponse>(
    `/api/forecast?lat=${hit.lat}&lon=${hit.lon}&name=${encodeURIComponent(hit.name)}&country=${encodeURIComponent(hit.country ?? '')}`,
  );
