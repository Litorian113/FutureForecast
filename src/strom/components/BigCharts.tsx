import { useState } from 'react';
import type { Backtest } from '../types';
import { styleOf } from '../lib/models';
import { fmtMW, monthShort } from '../lib/format';

const W = 1000;
const H = 440;
const PAD = { top: 20, right: 150, bottom: 40, left: 64 };
const innerW = W - PAD.left - PAD.right;
const innerH = H - PAD.top - PAD.bottom;

function ticks(max: number, n = 5): number[] {
  const raw = max / n;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const m = raw / pow;
  const step = (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * pow;
  const out: number[] = [];
  for (let v = 0; v <= max; v += step) out.push(v);
  return out;
}

interface Series {
  name: string;
  values: (number | null)[];
}

interface BigLineProps {
  series: Series[];
  xLabels: string[]; // one per index
  xTickEvery: number;
  hoverLabel: (i: number) => string;
  yLabel: string;
}

/** Shared big line chart: recessive grid, direct labels at the line ends, crosshair + tooltip. */
function BigLine({ series, xLabels, xTickEvery, hoverLabel, yLabel }: BigLineProps) {
  const [hover, setHover] = useState<number | null>(null);
  const n = xLabels.length;
  const max = Math.max(...series.flatMap((s) => s.values.map((v) => v ?? 0))) * 1.08;
  const x = (i: number) => PAD.left + (i / (n - 1)) * innerW;
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const yt = ticks(max);

  // direct labels at the right end, nudged apart so they do not overlap
  const ends = series
    .map((s) => ({ s, v: [...s.values].reverse().find((v) => v != null) ?? 0 }))
    .sort((a, b) => b.v - a.v);
  const labelY: number[] = [];
  ends.forEach((e, i) => {
    let py = y(e.v);
    if (i > 0 && py - labelY[i - 1] < 14) py = labelY[i - 1] + 14;
    labelY.push(py);
  });

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - PAD.left) / innerW) * (n - 1));
    setHover(i < 0 || i >= n ? null : i);
  };

  return (
    <div className="bigChart">
      <svg viewBox={`0 0 ${W} ${H}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label={yLabel}>
        <g className="axis">
          {yt.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={PAD.left + innerW} y1={y(v)} y2={y(v)} />
              <text x={PAD.left - 10} y={y(v) + 4} textAnchor="end">
                {fmtMW(v)}
              </text>
            </g>
          ))}
          <line className="baseline" x1={PAD.left} x2={PAD.left + innerW} y1={PAD.top + innerH} y2={PAD.top + innerH} />
          {xLabels.map((l, i) =>
            i % xTickEvery === 0 || i === n - 1 ? (
              <text key={i} x={x(i)} y={H - 16} textAnchor="middle">
                {l}
              </text>
            ) : null,
          )}
          <text x={PAD.left} y={PAD.top - 6} className="axisTitle">
            {yLabel}
          </text>
          {xLabels.map((_, i) =>
            i > 0 && i < n - 1 && i % xTickEvery === 0 ? (
              <line key={`v${i}`} x1={x(i)} x2={x(i)} y1={PAD.top} y2={PAD.top + innerH} />
            ) : null,
          )}
        </g>
        {series.map((s) => {
          const st = styleOf(s.name);
          const d = s.values
            .map((v, i) => (v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`))
            .filter(Boolean)
            .join('L');
          return <path key={s.name} d={`M${d}`} fill="none" stroke={st.color} strokeWidth={2} strokeDasharray={st.dash} strokeLinejoin="round" />;
        })}
        {ends.map((e, i) => (
          <text key={e.s.name} x={PAD.left + innerW + 10} y={labelY[i] + 4} className="endLabel" fill={styleOf(e.s.name).color}>
            {styleOf(e.s.name).label}
          </text>
        ))}
        {hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--text-2)" />
            {series.map((s) => {
              const v = s.values[hover];
              return v == null ? null : <circle key={s.name} cx={x(hover)} cy={y(v)} r={4.5} fill={styleOf(s.name).color} stroke="var(--bg)" strokeWidth={2} />;
            })}
          </g>
        )}
      </svg>
      {hover != null && (
        <div className="tooltip" style={{ left: (x(hover) / W) * 100 > 60 ? `calc(${(x(hover) / W) * 100}% - 250px)` : `calc(${(x(hover) / W) * 100}% + 16px)`, top: 30 }}>
          <div className="when">{hoverLabel(hover)}</div>
          {series
            .map((s) => ({ s, v: s.values[hover] }))
            .sort((a, b) => (a.v ?? 0) - (b.v ?? 0))
            .map(({ s, v }) => {
              const st = styleOf(s.name);
              return (
                <div className="line" key={s.name}>
                  <span className="nm">
                    <i className={`swatch${st.dash ? ' dashed' : ''}`} style={{ color: st.color }} />
                    {st.label}
                  </span>
                  <span>{v == null ? '–' : `${fmtMW(v)} MW`}</span>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

/** MAE at the reported lead times (1, 6, 24, 72, 168 h) as grouped bars - the big version of the
 * mini chart, one bar per visible model and lead, value on top, legend at the right. */
export function LeadChart({ data, visible }: { data: Backtest; visible: string[] }) {
  const [hover, setHover] = useState<{ lead: number; model: string } | null>(null);
  const models = visible.filter((m) => data.byLead[m]);
  const leads = data.meta.leadsReported;
  const vals = leads.map((l) => models.map((m) => data.byLead[m][l - 1] ?? 0));
  const max = Math.max(...vals.flat(), 1) * 1.12;
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const groupW = innerW / leads.length;
  const gap = 4;
  const barW = Math.max(6, Math.min(34, (groupW * 0.72 - gap * (models.length - 1)) / models.length));
  const groupInner = models.length * barW + (models.length - 1) * gap;
  const yt = ticks(max);

  return (
    <div className="bigChart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="MAE (MW) by lead time" onMouseLeave={() => setHover(null)}>
        <g className="axis">
          {yt.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={PAD.left + innerW} y1={y(v)} y2={y(v)} />
              <text x={PAD.left - 10} y={y(v) + 4} textAnchor="end">
                {fmtMW(v)}
              </text>
            </g>
          ))}
          <line className="baseline" x1={PAD.left} x2={PAD.left + innerW} y1={PAD.top + innerH} y2={PAD.top + innerH} />
          {leads.map((l, gi) => (
            <text key={l} x={PAD.left + gi * groupW + groupW / 2} y={H - 16} textAnchor="middle">
              {l < 24 ? `${l} h` : `${l} h · day ${l / 24}`}
            </text>
          ))}
          <text x={PAD.left} y={PAD.top - 6} className="axisTitle">
            MAE (MW) by lead time
          </text>
        </g>
        {leads.map((l, gi) =>
          models.map((m, mi) => {
            const v = vals[gi][mi];
            const st = styleOf(m);
            const x0 = PAD.left + gi * groupW + (groupW - groupInner) / 2 + mi * (barW + gap);
            const active = hover && hover.lead === l && hover.model === m;
            return (
              <g key={`${l}-${m}`} onMouseEnter={() => setHover({ lead: l, model: m })}>
                <rect x={x0} y={y(v)} width={barW} height={PAD.top + innerH - y(v)} rx={3} fill={st.color} opacity={st.dash ? 0.55 : active ? 1 : 0.9} />
                {(active || models.length <= 5) && (
                  <text x={x0 + barW / 2} y={y(v) - 6} textAnchor="middle" className="barLabel" fill={st.color}>
                    {fmtMW(v)}
                  </text>
                )}
              </g>
            );
          }),
        )}
        {models.map((m, i) => {
          const st = styleOf(m);
          return (
            <g key={m} transform={`translate(${PAD.left + innerW + 14}, ${PAD.top + 8 + i * 20})`}>
              <rect x={0} y={-6} width={12} height={12} rx={2} fill={st.color} opacity={st.dash ? 0.55 : 1} />
              <text x={18} y={4} className="endLabel" fill={st.color}>
                {st.label}
              </text>
            </g>
          );
        })}
      </svg>
      {hover && (
        <div className="tooltip" style={{ right: 20, top: 30 }}>
          <div className="when">Lead {hover.lead} h</div>
          <div className="line">
            <span className="nm">
              <i className="swatch" style={{ color: styleOf(hover.model).color }} />
              {styleOf(hover.model).label}
            </span>
            <span>{fmtMW(data.byLead[hover.model][hover.lead - 1] ?? 0)} MW</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** MAE by calendar month of the target hour. */
export function MonthChart({ data, visible }: { data: Backtest; visible: string[] }) {
  const models = visible.filter((m) => data.byMonth[m]);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const series = models.map((m) => ({ name: m, values: months.map((mo) => data.byMonth[m][String(mo)] ?? null) }));
  return (
    <BigLine
      series={series}
      xLabels={months.map(monthShort)}
      xTickEvery={1}
      hoverLabel={(i) => `${monthShort(i + 1)} · target hours in this month`}
      yLabel="MAE (MW) by month"
    />
  );
}
