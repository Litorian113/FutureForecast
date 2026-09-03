import type { ForecastMeta } from '../types';

/** Short, honest description of what the green dots are. */
export function ForecastNote({ meta }: { meta: ForecastMeta | null }) {
  if (!meta) {
    return (
      <div className="note">
        No forecast file found. Run <code>forecast/run_forecast.py</code> to generate
        <code> public/data/forecast.json</code>.
      </div>
    );
  }
  return (
    <div className="note">
      Green dots are <b>not</b> predictions of individual earthquakes. {meta.model} forecasts the monthly
      event <i>rate</i> per {meta.gridDeg}° grid cell from 1965–2016; dots are then sampled from those rates
      and placed near past epicentres (seed {meta.seed}). Years {meta.years[0]}–{meta.years[meta.years.length - 1]}.
    </div>
  );
}
