import type { ActualData, AppData, Earthquake, ForecastData, Tsunami } from '../types';

type RawEarthquake = Omit<Earthquake, 'year' | 'month'>;

const base = import.meta.env.BASE_URL;

async function fetchJson<T>(path: string, optional = false): Promise<T | null> {
  const res = await fetch(`${base}${path}`);
  if (!res.ok) {
    if (optional) return null;
    throw new Error(`Failed to load ${path} (${res.status})`);
  }
  return (await res.json()) as T;
}

let cached: Promise<AppData> | null = null;

/** Loads all datasets once per session; subsequent pages reuse the same promise. */
export function loadAppData(): Promise<AppData> {
  if (!cached) {
    cached = (async () => {
      const [eqRaw, tsunamis, forecast, actual] = await Promise.all([
        fetchJson<RawEarthquake[]>('data/earthquakes.json'),
        fetchJson<Tsunami[]>('data/tsunamis.json'),
        fetchJson<ForecastData>('data/forecast.json', true),
        fetchJson<ActualData>('data/actual.json', true),
      ]);
      const earthquakes: Earthquake[] = (eqRaw ?? []).map((e) => ({
        ...e,
        year: Number(e.date.slice(0, 4)),
        month: Number(e.date.slice(5, 7)),
      }));
      return { earthquakes, tsunamis: tsunamis ?? [], forecast, actual };
    })();
    cached.catch(() => {
      cached = null; // allow retry after a failure
    });
  }
  return cached;
}
