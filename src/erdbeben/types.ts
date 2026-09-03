export interface Earthquake {
  id: string;
  /** ISO date YYYY-MM-DD */
  date: string;
  /** HH:MM:SS */
  time: string;
  lat: number;
  lon: number;
  depth: number | null;
  mag: number;
  magType: string;
  /** "Earthquake" | "Nuclear Explosion" | "Explosion" | "Rock Burst" */
  type: string;
  year: number;
  month: number;
}

export interface Tsunami {
  id: number;
  year: number;
  month: number | null;
  day: number | null;
  hour: number | null;
  minute: number | null;
  lat: number;
  lon: number;
  intensity: number | null;
  cause: string;
  magnitude: number | null;
  depth: number | null;
  location: string;
  country: string;
  region: string;
  validity: string;
  comments: string;
  url: string;
}

/** One sampled, predicted earthquake produced by forecast/run_forecast.py */
export interface ForecastEvent {
  year: number;
  month: number;
  lat: number;
  lon: number;
  mag: number;
  depth: number;
  /** grid cell id "row,col" */
  cell: string;
  /** expected number of M5.5+ events per year in that cell for that year */
  rate: number;
}

export interface ForecastCell {
  id: string;
  lat0: number;
  lon0: number;
  /** historical average events per year (1965-2016) */
  hist: number;
  /** expected events per forecast year */
  yearly: number[];
  /** 10% / 90% quantile of yearly count */
  q10: number[];
  q90: number[];
}

export interface ForecastMeta {
  model: string;
  generated: string;
  years: number[];
  gridDeg: number;
  cells: number;
  horizonMonths: number;
  method: string;
  predictedPerYear: number[];
  historicalPerYear: number;
  seed: number;
}

export interface ForecastData {
  meta: ForecastMeta;
  cells: ForecastCell[];
  events: ForecastEvent[];
}

/** A real M5.5+ earthquake from the USGS feed, scored against the forecast (forecast/evaluate_actual.py). */
export interface ActualEvent {
  time: string;
  lat: number;
  lon: number;
  depth: number | null;
  mag: number;
  place: string;
  cell: string;
  inForecastCell: boolean;
  /** forecast rate (events / year) of the cell the event fell in */
  cellRate: number;
  cellHist: number;
  cellRank: number | null;
  nearestPredKm: number;
  nearestPredMonth: number | null;
  nearestPredMag: number | null;
}

export interface ActualMeta {
  source: string;
  from: string;
  to: string;
  windowDays: number;
  minMag: number;
  count: number;
  year: number;
  expectedTimesFM: number;
  expectedClimatology: number;
  inForecastCell: number;
  inTop50Cells: number;
  inTop100Cells: number;
  within100km: number;
  withinRadiusKm: number;
  radiusKm: number;
  null100km: number;
  nullRadius: number;
  medianNearestKm: number;
  logLikTimesFM: number;
  logLikClimatology: number;
  predictedInWindow: number;
}

export interface ActualData {
  meta: ActualMeta;
  events: ActualEvent[];
}

export interface AppData {
  earthquakes: Earthquake[];
  tsunamis: Tsunami[];
  /** null when public/data/forecast.json has not been generated yet */
  forecast: ForecastData | null;
  /** real events to compare with the forecast; null until evaluate_actual.py has run */
  actual: ActualData | null;
}

export type Level = 'low' | 'medium' | 'high';
export type LevelFlags = Record<Level, boolean>;
