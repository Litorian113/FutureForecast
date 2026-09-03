import { useCallback, useEffect, useMemo, useState } from 'react';
import { DotCanvas, type DotPoint } from '../components/DotCanvas';
import { Loader } from '../components/Loader';
import { Tooltip } from '../components/Tooltip';
import { YearSlider } from '../components/YearSlider';
import { useAppData } from '../hooks/useAppData';
import { useElementSize } from '../hooks/useElementSize';
import { useMapImage } from '../hooks/useMapImage';
import { haversineKm } from '../lib/places';
import {
  COLORS,
  YEAR_MAX,
  YEAR_MIN,
  fitMap,
  forecastColor,
  formatDate,
  formatIsoDate,
  intensityLevel,
  intensityRadius,
  latToY,
  lonToX,
  magnitudeLevel,
  magnitudeRadius,
} from '../lib/scales';
import type { ActualEvent, Earthquake, ForecastEvent, Tsunami } from '../types';

type HoverData = { kind: 'eq'; item: Earthquake } | { kind: 'tsu'; item: Tsunami } | { kind: 'fc'; item: ForecastEvent } | { kind: 'actual'; item: ActualEvent };

const PLAY_INTERVAL_MS = 650;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

export default function TimeBeam() {
  const { data, error } = useAppData();
  const mapImage = useMapImage();
  const { ref, width, height } = useElementSize<HTMLDivElement>();
  const [year, setYear] = useState(YEAR_MIN);
  const [playing, setPlaying] = useState(false);
  const [hover, setHover] = useState<{ point: DotPoint<HoverData>; x: number; y: number } | null>(null);

  const forecast = data?.forecast ?? null;
  const actual = data?.actual ?? null;
  const forecastYears = forecast?.meta.years ?? [];
  const maxYear = forecastYears.length ? forecastYears[forecastYears.length - 1] : YEAR_MAX;
  const forecastFrom = forecastYears.length ? forecastYears[0] : undefined;
  const isForecast = forecastFrom !== undefined && year >= forecastFrom;

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setYear((y) => (y >= maxYear ? YEAR_MIN : y + 1)), PLAY_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [playing, maxYear]);

  // Leave room for the slider panel at the bottom.
  const mapRect = useMemo(() => fitMap(width, Math.max(0, height - 110)), [width, height]);
  const scale = mapRect.w / 1440;

  // Bucket events by year once, instead of filtering 23k rows on every slider tick.
  const byYear = useMemo(() => {
    const eq = new Map<number, Earthquake[]>();
    const tsu = new Map<number, Tsunami[]>();
    const fc = new Map<number, ForecastEvent[]>();
    if (data) {
      for (const e of data.earthquakes) (eq.get(e.year) ?? eq.set(e.year, []).get(e.year)!).push(e);
      for (const t of data.tsunamis) (tsu.get(t.year) ?? tsu.set(t.year, []).get(t.year)!).push(t);
      for (const f of data.forecast?.events ?? []) (fc.get(f.year) ?? fc.set(f.year, []).get(f.year)!).push(f);
    }
    return { eq, tsu, fc };
  }, [data]);

  const points = useMemo(() => {
    const pts: DotPoint<HoverData>[] = [];
    if (isForecast) {
      for (const f of byYear.fc.get(year) ?? []) {
        pts.push({ x: lonToX(f.lon), y: latToY(f.lat), r: magnitudeRadius(f.mag, 'yearly', scale), color: forecastColor(f.mag), alpha: 0.9, data: { kind: 'fc', item: f } });
      }
      // Real events from the USGS feed, drawn on top of the predictions for the same year.
      if (actual && actual.meta.year === year) {
        for (const a of actual.events) {
          pts.push({ x: lonToX(a.lon), y: latToY(a.lat), r: magnitudeRadius(a.mag, 'yearly', scale) * 0.8, color: COLORS.actual, stroke: '#111', data: { kind: 'actual', item: a } });
        }
      }
      return pts;
    }
    for (const t of byYear.tsu.get(year) ?? []) {
      pts.push({ x: lonToX(t.lon), y: latToY(t.lat), r: intensityRadius(t.intensity, 'yearly', scale), color: COLORS.tsu[intensityLevel(t.intensity)], alpha: 0.85, data: { kind: 'tsu', item: t } });
    }
    for (const e of byYear.eq.get(year) ?? []) {
      pts.push({ x: lonToX(e.lon), y: latToY(e.lat), r: magnitudeRadius(e.mag, 'yearly', scale), color: COLORS.eq[magnitudeLevel(e.mag)], alpha: 0.9, data: { kind: 'eq', item: e } });
    }
    return pts;
  }, [byYear, year, isForecast, scale, actual]);

  const showActual = isForecast && actual !== null && actual.meta.year === year;

  // Pair every real event with its nearest predicted dot of the same year (and the nearest of the same month).
  const matches = useMemo(() => {
    if (!actual || !forecast) return [];
    const preds = forecast.events.filter((f) => f.year === actual.meta.year);
    return actual.events
      .map((a) => {
        let best: ForecastEvent | null = null;
        let bestKm = Infinity;
        let bestMonth: ForecastEvent | null = null;
        let bestMonthKm = Infinity;
        const month = Number(a.time.slice(5, 7));
        for (const f of preds) {
          const d = haversineKm(a.lat, a.lon, f.lat, f.lon);
          if (d < bestKm) {
            bestKm = d;
            best = f;
          }
          if (f.month === month && d < bestMonthKm) {
            bestMonthKm = d;
            bestMonth = f;
          }
        }
        return { actual: a, pred: best!, km: bestKm, predMonth: bestMonth, monthKm: bestMonthKm };
      })
      .sort((x, y) => x.km - y.km);
  }, [actual, forecast]);
  const info = isForecast
    ? `${(byYear.fc.get(year) ?? []).length} predicted earthquakes · TimesFM 3.0 rate forecast` +
      (showActual ? ` · ${actual.meta.count} real events ${actual.meta.from} – ${actual.meta.to} (USGS)` : '')
    : `${(byYear.eq.get(year) ?? []).length} earthquakes · ${(byYear.tsu.get(year) ?? []).length} tsunamis`;

  const onHover = useCallback((point: DotPoint<HoverData> | null, x: number, y: number) => setHover(point ? { point, x, y } : null), []);

  if (error) return <div className="errorBox">{error}</div>;

  return (
    <div className="page">
      {!data && <Loader />}
      <div ref={ref} className="stage">
        {data && width > 0 && <DotCanvas width={width} height={height} points={points} mapRect={mapRect} mapImage={mapImage} onHover={onHover} />}
      </div>

      <div className="overlayBox topRight legend">
        <div className="item"><span className="swatch" style={{ background: COLORS.eq.low }} /> M ≤ 6.0</div>
        <div className="item"><span className="swatch" style={{ background: COLORS.eq.medium }} /> M 6.0 – 6.5</div>
        <div className="item"><span className="swatch" style={{ background: COLORS.eq.high }} /> M &gt; 6.5</div>
        <div className="item"><span className="swatch" style={{ background: COLORS.tsu.medium }} /> Tsunami</div>
        {forecast && <div className="item"><span className="swatch" style={{ background: COLORS.forecast }} /> Predicted (2017+)</div>}
        {actual && <div className="item"><span className="swatch" style={{ background: COLORS.actual, border: '1.5px solid #111' }} /> Real events {actual.meta.year} (USGS)</div>}
      </div>

      {showActual && (
        <div className="overlayBox topLeft scoreCard">
          <div className="panelHeader">
            <b>Forecast check</b>
            <span className="muted"> · {actual.meta.from} – {actual.meta.to}</span>
          </div>
          {actual.meta.count} real M ≥ {actual.meta.minMag} quakes · TimesFM expected {actual.meta.expectedTimesFM}, climatology {actual.meta.expectedClimatology}
          <br />
          {actual.meta.withinRadiusKm} of {actual.meta.count} within {actual.meta.radiusKm} km of a predicted dot (random: {Math.round(actual.meta.nullRadius * 100)}%)
          <br />
          {actual.meta.inTop100Cells} of {actual.meta.count} in the 100 highest-rate cells
          <br />
          <span style={{ color: '#bbb' }}>
            Poisson log-likelihood: TimesFM {actual.meta.logLikTimesFM} vs. climatology {actual.meta.logLikClimatology}
            {actual.meta.logLikTimesFM < actual.meta.logLikClimatology ? ' — the historical mean rate per cell still fits better.' : ' — TimesFM fits better.'}
          </span>
          <div className="matchList">
            <div className="matchHeader">Best matches · real quake ↔ nearest predicted dot</div>
            {matches.slice(0, 12).map((m) => (
              <div className="match" key={m.actual.time + m.actual.place}>
                <span className="km">{Math.round(m.km)} km</span>
                <span className="matchBody">
                  <span>
                    <b>M{m.actual.mag.toFixed(1)}</b> · {shortDate(m.actual.time)} · {m.actual.place}
                  </span>
                  <span style={{ color: COLORS.forecast }}>
                    ↔ predicted <b>M{m.pred.mag.toFixed(1)}</b> · {MONTHS[m.pred.month - 1]} {m.pred.year}
                    {m.predMonth && m.predMonth !== m.pred ? ` · same month: M${m.predMonth.mag.toFixed(1)} at ${Math.round(m.monthKm)} km` : m.predMonth ? ' · same month ✓' : ''}
                  </span>
                </span>
              </div>
            ))}
            <span style={{ color: '#999' }}>
              {matches.filter((m) => m.monthKm <= 100).length} of {matches.length} real quakes have a predicted dot of the same month within 100 km;{' '}
              {matches.filter((m) => Math.abs(m.actual.mag - m.pred.mag) <= 0.5).length} have a nearest dot within ±0.5 magnitude.
            </span>
          </div>
        </div>
      )}

      <YearSlider min={YEAR_MIN} max={maxYear} value={year} onChange={setYear} forecastFrom={forecastFrom} playing={playing} onTogglePlay={() => setPlaying((p) => !p)} info={info} />

      {hover && <HoverTooltip hover={hover} />}
    </div>
  );
}

function HoverTooltip({ hover }: { hover: { point: DotPoint<HoverData>; x: number; y: number } }) {
  const d = hover.point.data;
  if (d.kind === 'eq') {
    const e = d.item;
    return (
      <Tooltip x={hover.x} y={hover.y}>
        <b>Date:</b> {formatIsoDate(e.date)}
        <br />
        <b>Time:</b> {e.time}
        <br />
        <b>Magnitude:</b> {e.mag.toFixed(1)} {e.magType} · <b>Depth:</b> {e.depth ?? '–'} km
      </Tooltip>
    );
  }
  if (d.kind === 'tsu') {
    const t = d.item;
    const time = t.hour === null ? '' : ` ${String(t.hour).padStart(2, '0')}:${String(t.minute ?? 0).padStart(2, '0')}`;
    return (
      <Tooltip x={hover.x} y={hover.y}>
        <b>Date:</b> {formatDate(t.year, t.month, t.day)}
        {time}
        <br />
        <b>Location:</b> {t.location}
        <br />
        <b>Cause:</b> {t.cause || '–'} · <b>Intensity:</b> {t.intensity ?? 'unknown'}
        {t.comments && <span className="comments">{t.comments.length > 400 ? `${t.comments.slice(0, 400)}…` : t.comments}</span>}
      </Tooltip>
    );
  }
  if (d.kind === 'actual') {
    const a = d.item;
    return (
      <Tooltip x={hover.x} y={hover.y}>
        <b>Real event (USGS):</b> {a.time.slice(0, 10)} {a.time.slice(11, 16)}
        <br />
        <b>{a.place}</b>
        <br />
        <b>Magnitude:</b> {a.mag.toFixed(1)} · <b>Depth:</b> {a.depth ?? '–'} km
        <br />
        <b>Forecast rate here:</b> {a.cellRate.toFixed(2)} / yr (cell rank {a.cellRank ?? '–'}) · <b>historical:</b> {a.cellHist.toFixed(2)} / yr
        <br />
        <b>Nearest predicted dot:</b> {a.nearestPredKm} km{a.nearestPredMonth ? ` (month ${a.nearestPredMonth})` : ''}
      </Tooltip>
    );
  }
  const f = d.item;
  return (
    <Tooltip x={hover.x} y={hover.y} variant="forecast">
      <b>Predicted · {String(f.month).padStart(2, '0')}/{f.year}</b>
      <br />
      <b>Sampled magnitude:</b> {f.mag.toFixed(1)} · <b>Depth:</b> {f.depth} km
      <br />
      <b>Expected rate in region:</b> {f.rate.toFixed(2)} / year
    </Tooltip>
  );
}
