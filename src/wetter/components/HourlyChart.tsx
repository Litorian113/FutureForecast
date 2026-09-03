import { useEffect, useMemo, useRef, useState } from 'react';
import type { ForecastResponse, Source } from '../types';
import { addHours, fmtDateTime, fmtDay, fmtSigned, fmtTemp, parseLocal } from '../lib/format';
import { useElementSize } from '../hooks/useElementSize';

interface Props {
  data: ForecastResponse;
  source: Source;
  selectedDay: number | null;
  days: number;
}

const PAD = { top: 22, right: 20, bottom: 30, left: 50 };
const PX_PER_HOUR = 5.5;
const CUTOFF_AT = 0.3;

function path(points: [number, number][]): string {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
}

function niceStep(range: number): number {
  const raw = range / 5;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const m = raw / pow;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * pow;
}

/** 14 days of history (grey), the "now" line, then `days` days of TimesFM (band + line) and the
 * weather model (line). Hand-made SVG, horizontally scrollable, fixed Y axis, hover tooltip with both values. */
export default function HourlyChart({ data, source, selectedDay, days }: Props) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  const horizon = Math.min(days * 24, data.hourly.ts.length);
  const hist = data.history.temp;
  const tf = useMemo(
    () => ({ mean: data.hourly.timesfm.temp.mean.slice(0, horizon), q10: data.hourly.timesfm.temp.q10.slice(0, horizon), q90: data.hourly.timesfm.temp.q90.slice(0, horizon) }),
    [data, horizon],
  );
  const nwp = useMemo(() => data.hourly.nwp.temp.slice(0, horizon), [data, horizon]);
  const nHist = hist.length;
  const H = horizon;
  // The past runs end at the cutoff, just like the history, so both are aligned at their end.
  // The chain may reach further back than the history - then its leading hours are dropped.
  const hind = data.hindcast;
  const hindSkip = hind ? Math.max(0, hind.ts.length - nHist) : 0;
  const hindOff = hind ? Math.max(0, nHist - hind.ts.length) : 0;
  const hindTf = useMemo(() => (hind ? hind.timesfm.mean.slice(hindSkip) : []), [hind, hindSkip]);
  const hindNwp = useMemo(() => (hind?.nwp ? hind.nwp.slice(hindSkip) : null), [hind, hindSkip]);
  const total = nHist + H;
  const cutoff = useMemo(() => parseLocal(data.hourly.ts[0]), [data]);
  const showTf = source !== 'nwp';
  const showNwp = source !== 'timesfm';

  const yDomain = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    const eat = (v: number | null) => {
      if (v == null) return;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    };
    hist.forEach(eat);
    if (showTf) {
      tf.mean.forEach(eat);
      tf.q10.forEach(eat);
      tf.q90.forEach(eat);
    }
    if (showNwp) nwp.forEach(eat);
    if (hind) {
      if (showTf) hindTf.forEach(eat);
      if (showNwp) hindNwp?.forEach(eat);
    }
    const pad = Math.max(1, (hi - lo) * 0.08);
    return [lo - pad, hi + pad] as const;
  }, [hist, tf, nwp, showTf, showNwp, hind, hindTf, hindNwp]);

  const W = Math.max(size.width, total * PX_PER_HOUR);
  const Hpx = Math.max(size.height, 200);
  const innerW = W - PAD.left - PAD.right;
  const innerH = Hpx - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (i / (total - 1)) * innerW;
  const y = (v: number) => PAD.top + innerH - ((v - yDomain[0]) / (yDomain[1] - yDomain[0])) * innerH;
  const xCut = x(nHist - 0.5);

  const scrolledFor = useRef<string | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || size.width === 0 || scrolledFor.current === data.cutoff) return;
    el.scrollLeft = xCut - size.width * CUTOFF_AT;
    setScrollLeft(el.scrollLeft);
    scrolledFor.current = data.cutoff;
  }, [size.width, xCut, data.cutoff]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || selectedDay == null) return;
    const start = nHist + selectedDay * 24;
    el.scrollTo({ left: x(start) - size.width * 0.18, behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDay]);

  const yTicks = useMemo(() => {
    const step = niceStep(yDomain[1] - yDomain[0]);
    const t: number[] = [];
    for (let v = Math.ceil(yDomain[0] / step) * step; v <= yDomain[1]; v += step) t.push(v);
    return t;
  }, [yDomain]);

  const dayTicks = useMemo(() => {
    const out: { i: number; date: Date }[] = [];
    const start = addHours(cutoff, -nHist);
    for (let i = 0; i < total; i++) {
      const d = addHours(start, i);
      if (d.getHours() === 0) out.push({ i, date: d });
    }
    return out;
  }, [cutoff, nHist, total]);

  const pts = (arr: (number | null)[], off: number) =>
    arr.map((v, i) => (v == null ? null : ([x(off + i), y(v)] as [number, number]))).filter((p): p is [number, number] => p != null);

  const bandPath = useMemo(() => {
    const up = pts(tf.q90, nHist);
    const lo = pts(tf.q10, nHist).reverse();
    return `${path(up)}L${lo.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join('L')}Z`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tf, nHist, W, Hpx, yDomain]);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - rect.left - PAD.left) / innerW) * (total - 1));
    setHover(i < 0 || i >= total ? null : i);
  };

  const hoverPx = hover == null ? 0 : x(hover) - scrollLeft;
  const tipLeft = Math.max(PAD.left + 4, Math.min(size.width - 230, hoverPx > size.width * 0.6 ? hoverPx - 240 : hoverPx + 18));
  const k = hover == null ? -1 : hover - nHist;
  const hi = hover == null || hind == null ? -1 : hover - hindOff;
  const inHind = hi >= 0 && hind != null && hi < hindTf.length && k < 0;
  const hv =
    hover == null
      ? null
      : k >= 0
        ? { tf: tf.mean[k], q10: tf.q10[k], q90: tf.q90[k], nwp: nwp[k] }
        : { hist: hist[hover], pastTf: inHind ? hindTf[hi] : null, pastNwp: inHind ? (hindNwp?.[hi] ?? null) : null };

  return (
    <div className="chartWrap" ref={ref}>
      <div className="chartScroll" ref={scrollRef} onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}>
        <svg width={W} height={Hpx} viewBox={`0 0 ${W} ${Hpx}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label="Hourly temperature: 14 days of history and the forecast">
          {dayTicks.map((d) => (
            <rect key={`n${d.i}`} className="nightBand" x={x(d.i - 3)} y={PAD.top} width={x(d.i + 6) - x(d.i - 3)} height={innerH} />
          ))}
          {selectedDay != null && (
            <rect className="dayHighlight" x={x(nHist + selectedDay * 24)} y={PAD.top} width={x(nHist + selectedDay * 24 + 24) - x(nHist + selectedDay * 24)} height={innerH} />
          )}
          <g className="axis">
            {yTicks.map((v) => (
              <line key={v} x1={PAD.left} x2={PAD.left + innerW} y1={y(v)} y2={y(v)} />
            ))}
          </g>
          {dayTicks.map((d) => (
            <text key={d.i} className="dayLabel" x={x(d.i) + 4} y={Hpx - 10}>
              {fmtDay(d.date)}
            </text>
          ))}
          {showTf && <path d={bandPath} fill="var(--c-timesfm-fill)" />}
          {/* what the two models said `hindcastDays` ago, laid over the measured truth */}
          {hind && (
            <g opacity={0.5}>
              {showNwp && hindNwp && (
                <path d={path(pts(hindNwp, hindOff))} fill="none" stroke="var(--c-nwp)" strokeWidth={1.5} strokeDasharray="5 3" />
              )}
              {showTf && (
                <path d={path(pts(hindTf, hindOff))} fill="none" stroke="var(--c-timesfm)" strokeWidth={1.5} strokeDasharray="5 3" />
              )}
            </g>
          )}
          <path d={path(pts(hist, 0))} fill="none" stroke="var(--c-history)" strokeWidth={1.6} />
          {showNwp && <path d={path(pts(nwp, nHist))} fill="none" stroke="var(--c-nwp)" strokeWidth={2} strokeLinejoin="round" />}
          {showTf && <path d={path(pts(tf.mean, nHist))} fill="none" stroke="var(--c-timesfm)" strokeWidth={2.2} strokeLinejoin="round" />}
          <line x1={xCut} x2={xCut} y1={PAD.top - 8} y2={PAD.top + innerH} stroke="var(--text-2)" strokeDasharray="3 4" />
          <text className="cutoffLabel" x={xCut - 6} y={PAD.top - 2} textAnchor="end">
            History
          </text>
          <text className="cutoffLabel" x={xCut + 6} y={PAD.top - 2}>
            now · {H} h ahead
          </text>
          {hover != null && hv && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--text-2)" strokeWidth={1} />
              {'hist' in hv && hv.hist != null && <circle cx={x(hover)} cy={y(hv.hist)} r={4} fill="var(--c-history)" stroke="var(--bg)" strokeWidth={2} />}
              {'tf' in hv && showTf && hv.tf != null && <circle cx={x(hover)} cy={y(hv.tf)} r={4} fill="var(--c-timesfm)" stroke="var(--bg)" strokeWidth={2} />}
              {'nwp' in hv && showNwp && hv.nwp != null && <circle cx={x(hover)} cy={y(hv.nwp)} r={4} fill="var(--c-nwp)" stroke="var(--bg)" strokeWidth={2} />}
            </g>
          )}
        </svg>
      </div>
      <div className="yAxis" style={{ width: PAD.left }}>
        <svg width={PAD.left} height={Hpx} className="axis">
          {yTicks.map((v) => (
            <text key={v} x={PAD.left - 8} y={y(v) + 3.5} textAnchor="end">
              {fmtTemp(v)}
            </text>
          ))}
        </svg>
      </div>
      {hover != null && hv && (
        <div className="tooltip" style={{ left: tipLeft, top: 26 }}>
          <div className="when">{fmtDateTime(addHours(cutoff, hover - nHist))}</div>
          {'hist' in hv && (
            <>
              <div className="line">
                <span className="nm">
                  <i className="swatch" style={{ color: 'var(--c-history)' }} /> Measured
                </span>
                <span className="num">{fmtTemp(hv.hist, 1)}</span>
              </div>
              {showTf && hv.pastTf != null && (
                <div className="line">
                  <span className="nm">
                    <i className="swatch dashed" style={{ color: 'var(--c-timesfm)', opacity: 0.6 }} /> TimesFM back then
                  </span>
                  <span className="num">
                    {fmtTemp(hv.pastTf, 1)}
                    {hv.hist != null && <span className="err">{fmtSigned(hv.pastTf - hv.hist)}</span>}
                  </span>
                </div>
              )}
              {showNwp && hv.pastNwp != null && (
                <div className="line">
                  <span className="nm">
                    <i className="swatch dashed" style={{ color: 'var(--c-nwp)', opacity: 0.6 }} /> Model back then
                  </span>
                  <span className="num">
                    {fmtTemp(hv.pastNwp, 1)}
                    {hv.hist != null && <span className="err">{fmtSigned(hv.pastNwp - hv.hist)}</span>}
                  </span>
                </div>
              )}
            </>
          )}
          {'tf' in hv && showTf && (
            <div className="line">
              <span className="nm">
                <i className="swatch" style={{ color: 'var(--c-timesfm)' }} /> TimesFM
              </span>
              <span className="num">
                {fmtTemp(hv.tf, 1)}
                <span className="err">
                  {fmtTemp(hv.q10, 0)}…{fmtTemp(hv.q90, 0)}
                </span>
              </span>
            </div>
          )}
          {'nwp' in hv && showNwp && (
            <div className="line">
              <span className="nm">
                <i className="swatch" style={{ color: 'var(--c-nwp)' }} /> Weather model
              </span>
              <span className="num">{fmtTemp(hv.nwp, 1)}</span>
            </div>
          )}
          {'tf' in hv && source === 'both' && hv.tf != null && hv.nwp != null && (
            <div className="line">
              <span className="nm" style={{ color: 'var(--muted)' }}>Difference</span>
              <span className="num" style={{ color: 'var(--muted)' }}>{fmtSigned(hv.tf - hv.nwp)} °C</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
