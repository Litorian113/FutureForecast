export type ModelName = string;

export interface ModelSummary {
  mae: number;
  rmse: number;
  mape: number;
  bias: number;
  pinball: number | null;
  coverage80: number | null;
  bandWidth: number | null;
  wins: number;
}

export interface ModelForecast {
  mean: number[];
  q10: number[] | null;
  q90: number[] | null;
}

export interface CutoffRecord {
  cutoff: string; // ISO local time, first forecast hour
  history: number[]; // last meta.historyShown hours before the cutoff
  actual: number[]; // meta.horizon hours
  forecasts: Record<ModelName, ModelForecast>;
  mae: Record<ModelName, number>;
}

export interface BacktestMeta {
  region: string;
  horizon: number;
  stepDays: number;
  cutoffs: number;
  models: ModelName[];
  generated: string;
  runtimeSec: Record<ModelName, number>;
  hasBand: Record<ModelName, boolean>;
  historyShown: number;
  truthP95: number;
  truthMean: number;
  leadsReported: number[];
}

export interface Backtest {
  meta: BacktestMeta;
  summary: Record<ModelName, ModelSummary>;
  byLead: Record<ModelName, number[]>; // MAE per lead hour, index 0 = lead 1
  byMonth: Record<ModelName, Record<string, number>>; // "1".."12" -> MAE
  cutoffs: CutoffRecord[];
}
