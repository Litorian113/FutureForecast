import { useEffect, useMemo, useRef, useState } from 'react';
import type { CutoffRecord } from '../types';
import { styleOf } from '../lib/models';
import { addHours, fmtDateTime, fmtDay, fmtGW, fmtMW, fmtSigned, parseLocal } from '../lib/format';
import { useElementSize } from '../hooks/useElementSize';

interface Props {
  record: CutoffRecord;
  visible: string[];
}

const PAD = { top: 18, right: 16, bottom: 30, left: 52 };
const PX_PER_HOUR = 5; // chart width = hours × this; wider than the panel → horizontal scroll
const CUTOFF_AT = 0.42; // initial scroll: cutoff line at 42 % of the visible width

function path(points: [number, number][]): string {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
}

function niceStep(range: number): number {
  const raw = range / 5;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const m = raw / pow;
  const step = m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10;
  return step * pow;
}

/** Two weeks of history, the cutoff, one week of truth and every visible model, as SVG. */
export default function Chart({ record, visible }: Props) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [hover, setHover] = useState<number | null>(null); // index in the combined series

  const cutoff = useMemo(() => parseLocal(record.cutoff), [record.cutoff]);
  const H = record.actual.length;
  const nHist = record.history.length;
  const total = nHist + H;

  const yDomain = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    const eat = (v: number | null) => {
      if (v == null) return;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    };
    record.history.forEach(eat);
    record.actual.forEach(eat);
    for (const m of visible) {
      const f = record.forecasts[m];
      if (!f) continue;
      f.mean.forEach(eat);
      f.q10?.forEach(eat);
      f.q90?.forEach(eat);
    }
    const pad = (hi - lo) * 0.08;
    return [Math.max(0, lo - pad), hi + pad] as const;
  }, [record, visible]);

  const W = Math.max(size.width, total * PX_PER_HOUR);
  const Hpx = Math.max(size.height, 240);
  const innerW = W - PAD.left - PAD.right;
  const innerH = Hpx - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (i / (total - 1)) * innerW;
  const y = (v: number) => PAD.top + innerH - ((v - yDomain[0]) / (yDomain[1] - yDomain[0])) * innerH;
  const xCut = x(nHist - 0.5);

  // first layout: scroll so that the cutoff sits at CUTOFF_AT of the visible width
  const scrolledOnce = useRef(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || size.width === 0 || scrolledOnce.current) return;
    el.scrollLeft = xCut - size.width * CUTOFF_AT;
    setScrollLeft(el.scrollLeft);
    scrolledOnce.current = true;
  }, [size.width, xCut]);

  const yTicks = useMemo(() => {
    const step = niceStep(yDomain[1] - yDomain[0]);
    const ticks: number[] = [];
    for (let v = Math.ceil(yDomain[0] / step) * step; v <= yDomain[1]; v += step) ticks.push(v);
    return ticks;
  }, [yDomain]);

  // one label per midnight, weekend bands
  const days = useMemo(() => {
    const out: { i: number; date: Date; weekend: boolean }[] = [];
    const start = addHours(cutoff, -nHist);
    for (let i = 0; i < total; i++) {
      const d = addHours(start, i);
      if (d.getHours() === 0) out.push({ i, date: d, weekend: d.getDay() === 0 || d.getDay() === 6 });
    }
    return out;
  }, [cutoff, nHist, total]);

  const histPath = path(record.history.map((v, i) => [x(i), y(v)] as [number, number]));
  const truthPath = path(record.actual.map((v, i) => [x(nHist + i), y(v)] as [number, number]));

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = Math.round(((px - PAD.left) / innerW) * (total - 1));
    setHover(i < 0 || i >= total ? null : i);
  };

  const hoverInfo = hover == null ? null : buildHover(record, visible, hover, nHist, cutoff);
  const hoverPx = hover == null ? 0 : x(hover) - scrollLeft; // in visible coordinates
  const tipLeft = Math.max(PAD.left + 4, Math.min(size.width - 240, hoverPx > size.width * 0.6 ? hoverPx - 250 : hoverPx + 18));

  return (
    <div className="chartWrap" ref={ref}>
      <div className="chartScroll" ref={scrollRef} onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}>
      <svg
        width={W}
        height={Hpx}
        viewBox={`0 0 ${W} ${Hpx}`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={`Hourly load around the cutoff ${record.cutoff}`}
      >
        {days
          .filter((d) => d.weekend)
          .map((d) => (
            <rect
              key={`we${d.i}`}
              className="weekendBand"
              x={x(d.i)}
              y={PAD.top}
              width={Math.min(x(d.i + 24), PAD.left + innerW) - x(d.i)}
              height={innerH}
            />
          ))}
        <g className="axis">
          {yTicks.map((v) => (
            <line key={v} x1={PAD.left} x2={PAD.left + innerW} y1={y(v)} y2={y(v)} />
          ))}
          <line className="baseline" x1={PAD.left} x2={PAD.left + innerW} y1={PAD.top + innerH} y2={PAD.top + innerH} />
        </g>
        {days.map((d) => (
          <text key={d.i} className="dayLabel" x={x(d.i) + 3} y={Hpx - 12}>
            {d.i % 48 === 0 || days.length < 12 ? fmtDay(d.date) : ''}
          </text>
        ))}

        {/* bands first, then lines */}
        {visible.map((m) => {
          const f = record.forecasts[m];
          if (!f?.q10 || !f?.q90) return null;
          const st = styleOf(m);
          const upper = f.q90.map((v, i) => [x(nHist + i), y(v)] as [number, number]);
          const lower = f.q10.map((v, i) => [x(nHist + i), y(v)] as [number, number]).reverse();
          return (
            <path
              key={`band${m}`}
              d={`${path(upper)}L${lower.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join('L')}Z`}
              fill={st.color}
              opacity={st.family === 'timesfm' ? 0.2 : 0.09}
            />
          );
        })}
        <path d={histPath} fill="none" stroke="var(--history)" strokeWidth={1.5} />
        {visible.map((m) => {
          const f = record.forecasts[m];
          if (!f) return null;
          const st = styleOf(m);
          return (
            <path
              key={m}
              d={path(f.mean.map((v, i) => [x(nHist + i), y(v)] as [number, number]))}
              fill="none"
              stroke={st.color}
              strokeWidth={2}
              strokeDasharray={st.dash}
              strokeLinejoin="round"
            />
          );
        })}
        <path d={truthPath} fill="none" stroke="var(--truth)" strokeWidth={2} />

        <line x1={xCut} x2={xCut} y1={PAD.top - 6} y2={PAD.top + innerH} stroke="var(--text-2)" strokeDasharray="3 4" />
        <text className="cutoffLabel" x={xCut - 6} y={PAD.top + 2} textAnchor="end">
          history
        </text>
        <text className="cutoffLabel" x={xCut + 6} y={PAD.top + 2}>
          forecast · {H} h
        </text>

        {hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--text-2)" strokeWidth={1} />
            {hoverInfo?.points.map((p) => (
              <circle key={p.key} cx={x(hover)} cy={y(p.value)} r={4} fill={p.color} stroke="var(--bg)" strokeWidth={2} />
            ))}
          </g>
        )}
      </svg>
      </div>
      <div className="yAxis" style={{ width: PAD.left }}>
        <svg width={PAD.left} height={Hpx} className="axis">
          {yTicks.map((v) => (
            <text key={v} x={PAD.left - 8} y={y(v) + 3.5} textAnchor="end">
              {fmtGW(v)}
            </text>
          ))}
        </svg>
      </div>
      {hover != null && hoverInfo && (
        <div className="tooltip" style={{ left: tipLeft, top: 28 }}>
          <div className="when">{fmtDateTime(hoverInfo.when)}</div>
          <div className="line truth">
            <span className="nm">
              <i className="swatch" style={{ color: hoverInfo.truthColor }} />
              {hoverInfo.truthLabel}
            </span>
            <span>{fmtMW(hoverInfo.truth)} MW</span>
          </div>
          {hoverInfo.models.map((m) => (
            <div className="line" key={m.name}>
              <span className="nm">
                <i className={`swatch${m.dash ? ' dashed' : ''}`} style={{ color: m.color }} />
                {m.label}
              </span>
              <span>
                {fmtMW(m.value)}
                <span className="err">{fmtSigned(m.value - hoverInfo.truth)}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function buildHover(record: CutoffRecord, visible: string[], i: number, nHist: number, cutoff: Date) {
  const inForecast = i >= nHist;
  const k = i - nHist;
  const truth = inForecast ? record.actual[k] : record.history[i];
  const when = addHours(cutoff, i - nHist);
  const points: { key: string; value: number; color: string }[] = [
    { key: 'truth', value: truth, color: inForecast ? '#ffffff' : '#8a8a86' },
  ];
  const models = inForecast
    ? visible
        .filter((m) => record.forecasts[m])
        .map((m) => {
          const st = styleOf(m);
          const value = record.forecasts[m].mean[k];
          points.push({ key: m, value, color: st.color });
          return { name: m, label: st.label, color: st.color, dash: st.dash, value };
        })
    : [];
  return {
    when,
    truth,
    truthLabel: inForecast ? 'Actual load' : 'History',
    truthColor: inForecast ? '#ffffff' : '#8a8a86',
    points,
    models,
  };
}
