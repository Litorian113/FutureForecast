import { useCallback, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { DotCanvas, type DotPoint, type MapRect } from '../components/DotCanvas';
import { ForecastNote } from '../components/ForecastNote';
import { LevelButtons } from '../components/LevelButtons';
import { Loader } from '../components/Loader';
import { ToggleSwitch } from '../components/ToggleSwitch';
import { Tooltip } from '../components/Tooltip';
import { useAppData } from '../hooks/useAppData';
import { useElementSize } from '../hooks/useElementSize';
import { useSvgImage } from '../hooks/useMapImage';
import { DOUBLE_MAP_URL } from '../lib/mapImage';
import {
  COLORS,
  DOUBLE_MAP,
  INTENSITY_LABELS,
  LEVEL_LABELS,
  OVERVIEW_RADIUS,
  OVERVIEW_TSUNAMI_RADIUS,
  doubleMapLatToY,
  forecastColor,
  formatDate,
  formatIsoDate,
  intensityLevel,
  lonToX,
  magnitudeLevel,
} from '../lib/scales';
import type { ActualEvent, Earthquake, ForecastEvent, LevelFlags, Tsunami } from '../types';

type HoverData = { kind: 'eq'; item: Earthquake } | { kind: 'tsu'; item: Tsunami } | { kind: 'fc'; item: ForecastEvent } | { kind: 'actual'; item: ActualEvent };

const ALL_ON: LevelFlags = { low: true, medium: true, high: true };
/** The legacy page placed the map image 50px below the top of the stage. */
const MAP_TOP_OFFSET = 50;
const arrowRight = `${import.meta.env.BASE_URL}Assets/rightWhite.svg`;
const arrowLeft = `${import.meta.env.BASE_URL}Assets/leftWhite.svg`;

export default function Overview() {
  const { data, error } = useAppData();
  const { ref, width, height } = useElementSize<HTMLDivElement>();
  // The original black-on-dark DoubleMap.svg holds two worlds side by side; crop it to the first
  // world (the canvas repeats it for the wrap-around) and give it an explicit intrinsic size,
  // because the file only has a viewBox.
  const mapImage = useSvgImage(DOUBLE_MAP_URL, {
    viewBox: `0 0 ${DOUBLE_MAP.worldWidth} ${DOUBLE_MAP.worldHeight}`,
    width: DOUBLE_MAP.worldWidth,
    height: DOUBLE_MAP.worldHeight,
  });

  const [panelOpen, setPanelOpen] = useState(false);
  const [showEq, setShowEq] = useState(true);
  const [showTsu, setShowTsu] = useState(true);
  const [eqLevels, setEqLevels] = useState<LevelFlags>(ALL_ON);
  const [tsuLevels, setTsuLevels] = useState<LevelFlags>(ALL_ON);
  const [showForecast, setShowForecast] = useState(false);
  const [forecastYear, setForecastYear] = useState<'all' | number>('all');
  const [offsetX, setOffsetX] = useState(0);
  const [hover, setHover] = useState<{ point: DotPoint<HoverData>; x: number; y: number } | null>(null);
  const drag = useRef<{ startX: number; startOffset: number; moved: boolean } | null>(null);

  // One world fills the full width, like the legacy slider image (2 × width for the double map).
  const mapRect = useMemo<MapRect>(
    () => ({ x: 0, y: MAP_TOP_OFFSET, w: width, h: (width * DOUBLE_MAP.worldHeight) / DOUBLE_MAP.worldWidth }),
    [width],
  );
  const forecast = data?.forecast ?? null;
  const actual = data?.actual ?? null;

  const points = useMemo(() => {
    const pts: DotPoint<HoverData>[] = [];
    if (!data) return pts;
    // Draw order as in the legacy page: earthquakes first, tsunami markers on top.
    if (showEq) {
      for (const e of data.earthquakes) {
        const lvl = magnitudeLevel(e.mag);
        if (!eqLevels[lvl]) continue;
        pts.push({ x: lonToX(e.lon), y: doubleMapLatToY(e.lat), r: OVERVIEW_RADIUS[lvl], color: COLORS.eq[lvl], data: { kind: 'eq', item: e } });
      }
    }
    if (showTsu) {
      for (const t of data.tsunamis) {
        const lvl = intensityLevel(t.intensity);
        if (!tsuLevels[lvl]) continue;
        pts.push({ x: lonToX(t.lon), y: doubleMapLatToY(t.lat), r: OVERVIEW_TSUNAMI_RADIUS, color: COLORS.tsu[lvl], data: { kind: 'tsu', item: t } });
      }
    }
    if (showForecast && forecast) {
      for (const f of forecast.events) {
        if (forecastYear !== 'all' && f.year !== forecastYear) continue;
        pts.push({ x: lonToX(f.lon), y: doubleMapLatToY(f.lat), r: OVERVIEW_RADIUS[magnitudeLevel(f.mag)] + 0.4, color: forecastColor(f.mag), data: { kind: 'fc', item: f } });
      }
      if (actual && (forecastYear === 'all' || forecastYear === actual.meta.year)) {
        for (const a of actual.events) {
          pts.push({ x: lonToX(a.lon), y: doubleMapLatToY(a.lat), r: OVERVIEW_RADIUS[magnitudeLevel(a.mag)] + 1.2, color: COLORS.actual, stroke: '#111', data: { kind: 'actual', item: a } });
        }
      }
    }
    return pts;
  }, [data, forecast, actual, showEq, showTsu, eqLevels, tsuLevels, showForecast, forecastYear]);

  const counts = useMemo(() => {
    let eq = 0, tsu = 0, fc = 0;
    for (const p of points) {
      if (p.data.kind === 'eq') eq++;
      else if (p.data.kind === 'tsu') tsu++;
      else fc++;
    }
    return { eq, tsu, fc };
  }, [points]);

  // --- horizontal drag with seamless wrap-around ---
  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      drag.current = { startX: e.clientX, startOffset: offsetX, moved: false };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [offsetX],
  );
  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      if (!d || mapRect.w === 0) return;
      const dx = e.clientX - d.startX;
      if (Math.abs(dx) > 2) d.moved = true;
      let o = d.startOffset + dx;
      o = ((o % mapRect.w) + mapRect.w) % mapRect.w;
      if (o > 0) o -= mapRect.w;
      setOffsetX(o);
      if (d.moved) setHover(null);
    },
    [mapRect.w],
  );
  const endDrag = useCallback(() => {
    drag.current = null;
  }, []);

  const onHover = useCallback((point: DotPoint<HoverData> | null, x: number, y: number) => {
    if (drag.current?.moved) return;
    setHover(point ? { point, x, y } : null);
  }, []);

  if (error) return <div className="errorBox">{error}</div>;

  return (
    <div className="page" onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}>
      {!data && <Loader />}
      <div ref={ref} className="stage" style={{ cursor: drag.current ? 'grabbing' : 'grab' }}>
        {data && width > 0 && (
          <DotCanvas
            width={width}
            height={height}
            points={points}
            mapRect={mapRect}
            mapImage={mapImage}
            offsetX={offsetX}
            wrap
            onHover={onHover}
            onPointerDown={onPointerDown}
          />
        )}
      </div>

      <aside className={`controlPanel${panelOpen ? ' open' : ''}`} aria-hidden={!panelOpen}>
        <h2>
          Tsunami and
          <br />
          Earthquake Events
        </h2>
        <div className="section">
          <ToggleSwitch label="Earthquake" checked={showEq} onChange={setShowEq} />
          <ToggleSwitch label="Tsunami" checked={showTsu} onChange={setShowTsu} />
        </div>
        <hr />
        <div className="section">
          <div className="sectionTitle">Earthquake Intensity</div>
          <LevelButtons flags={eqLevels} onChange={setEqLevels} colors={COLORS.eq} labels={LEVEL_LABELS} />
        </div>
        <div className="section">
          <div className="sectionTitle">Tsunami Intensity</div>
          <LevelButtons flags={tsuLevels} onChange={setTsuLevels} colors={COLORS.tsu} labels={INTENSITY_LABELS} />
        </div>
        <hr />
        <div className="section">
          <div className="sectionTitle">Forecast · TimesFM 3.0</div>
          <div className="row" style={{ opacity: forecast ? 1 : 0.5 }}>
            <span>Predicted earthquakes</span>
            <label className="switch">
              <input type="checkbox" checked={showForecast} disabled={!forecast} onChange={(e) => setShowForecast(e.target.checked)} aria-label="Predicted earthquakes" />
              <span className="knob" />
            </label>
          </div>
          {forecast && showForecast && (
            <div className="row">
              <span>Year</span>
              <select value={forecastYear} onChange={(e) => setForecastYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
                <option value="all">all {forecast.meta.years[0]}–{forecast.meta.years[forecast.meta.years.length - 1]}</option>
                {forecast.meta.years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          )}
          <ForecastNote meta={forecast?.meta ?? null} />
          {actual && showForecast && (
            <div className="note">
              White dots: {actual.meta.count} real M ≥ {actual.meta.minMag} quakes from the USGS feed ({actual.meta.from} – {actual.meta.to}).{' '}
              {actual.meta.withinRadiusKm} of {actual.meta.count} lie within {actual.meta.radiusKm} km of a predicted dot; details on the Time Beam page.
            </div>
          )}
        </div>
        <hr />
        <div className="stats">
          {counts.eq.toLocaleString()} earthquakes · {counts.tsu.toLocaleString()} tsunamis
          {showForecast && forecast ? ` · ${counts.fc.toLocaleString()} predicted` : ''}
          <br />
          1965 – 2016 · M ≥ 5.5 · drag the map to pan
        </div>
      </aside>
      <button type="button" className={`panelToggle${panelOpen ? ' open' : ''}`} onClick={() => setPanelOpen((o) => !o)} aria-label={panelOpen ? 'Close panel' : 'Open panel'}>
        <img src={panelOpen ? arrowLeft : arrowRight} alt="" width={20} height={20} />
      </button>

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
        <b>Date:</b> {formatIsoDate(e.date)} {e.time}
        <br />
        <b>Type:</b> {e.type}
        <br />
        <b>Magnitude:</b> {e.mag.toFixed(1)} {e.magType}
        <br />
        <b>Depth:</b> {e.depth === null ? '–' : `${e.depth} km`}
      </Tooltip>
    );
  }
  if (d.kind === 'tsu') {
    const t = d.item;
    return (
      <Tooltip x={hover.x} y={hover.y}>
        <b>Date:</b> {formatDate(t.year, t.month, t.day)}
        <br />
        <b>Cause:</b> {t.cause || '–'}
        <br />
        <b>Intensity:</b> {t.intensity ?? 'unknown'}
        <br />
        <b>Location:</b> {t.location}
        {t.country ? `, ${t.country}` : ''}
        {t.comments && <span className="comments">{t.comments.length > 320 ? `${t.comments.slice(0, 320)}…` : t.comments}</span>}
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
        <b>Forecast rate here:</b> {a.cellRate.toFixed(2)} / yr · <b>nearest predicted dot:</b> {a.nearestPredKm} km
      </Tooltip>
    );
  }
  const f = d.item;
  return (
    <Tooltip x={hover.x} y={hover.y} variant="forecast">
      <b>Predicted earthquake · {String(f.month).padStart(2, '0')}/{f.year}</b>
      <br />
      <b>Sampled magnitude:</b> {f.mag.toFixed(1)} · <b>Depth:</b> {f.depth} km
      <br />
      <b>Expected rate in region:</b> {f.rate.toFixed(2)} events / year
      <span className="comments">Rate forecast by TimesFM 3.0; location sampled near historical epicentres.</span>
    </Tooltip>
  );
}
