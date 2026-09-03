/** Shapes served by weather/server.py (see its docstring). All times are local ISO strings without zone. */

export type IconClass = 'clear' | 'cloudy' | 'rain' | 'snow' | 'fog';

export interface GeoHit {
  name: string;
  country: string | null;
  admin1: string | null;
  lat: number;
  lon: number;
  tz: string | null;
}

export interface Band {
  mean: (number | null)[];
  q10: (number | null)[];
  q90: (number | null)[];
}

export interface DayCard {
  date: string;
  tmin: number;
  tmax: number;
  precip: number;
  pRain: number;
  icon: IconClass | null;
}

export interface ExpectedError {
  city: string;
  year: number;
  cutoffs: number;
  byLead: Record<string, (number | null)[]>;
  skill: Record<string, number | null>;
  symbolHit: Record<string, number | null>;
  coverage80: Record<string, number | null>;
}

export interface ForecastResponse {
  city: { name: string; country: string | null; tz: string; lat: number; lon: number; elevation?: number };
  generated: string;
  cutoff: string;
  runtimeMs: number;
  current: { temp: number; code: number; icon: IconClass; rh: number; wind: number };
  hourly: {
    ts: string[];
    timesfm: Record<'temp' | 'precip' | 'cloud' | 'rh' | 'wind', Band>;
    nwp: Record<'temp' | 'precip' | 'cloud' | 'rh' | 'wind', (number | null)[]> & { code: number[] };
  };
  daily: { timesfm: DayCard[]; nwp: DayCard[] };
  history: { ts: string[]; temp: (number | null)[] };
  expectedError: ExpectedError | null;
  contextHours: number;
}

export type Source = 'timesfm' | 'nwp' | 'both';
