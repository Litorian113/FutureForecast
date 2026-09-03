import { useState } from 'react';
import type { Backtest } from '../types';
import { styleOf } from '../lib/models';
import { fmtMW, monthShort } from '../lib/format';
import Modal, { ExpandButton } from './Modal';
import { LeadChart, MonthChart } from './BigCharts';

interface Props {
  data: Backtest;
  visible: string[];
}

const W = 260;
const H = 92;
const PAD = { top: 6, bottom: 16, left: 0, right: 0 };

/** MAE per lead hour (grouped bars) and per calendar month (lines) for the visible models. */
export default function MiniBars({ data, visible }: Props) {
  const [open, setOpen] = useState<'lead' | 'month' | null>(null);
  const leads = data.meta.leadsReported;
  const models = visible.filter((m) => data.byLead[m]);
  if (models.length === 0) return null;

  const leadMax = Math.max(...models.flatMap((m) => leads.map((l) => data.byLead[m][l - 1] ?? 0)));
  const innerH = H - PAD.top - PAD.bottom;
  const groupW = (W - PAD.left - PAD.right) / leads.length;
  const barW = Math.max(2, Math.min(10, (groupW - 10) / models.length - 2));

  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const monthVals = models.map((m) => months.map((mo) => data.byMonth[m][String(mo)] ?? null));
  const monthMax = Math.max(...monthVals.flat().map((v) => v ?? 0));
  const monthMin = Math.min(...monthVals.flat().map((v) => v ?? Infinity));
  const xm = (i: number) => PAD.left + (i / 11) * (W - PAD.left - PAD.right);
  const ym = (v: number) => PAD.top + innerH - ((v - monthMin * 0.9) / (monthMax - monthMin * 0.9)) * innerH;

  return (
    <div className="miniRow">
      <div className="miniBox" onClick={() => setOpen('lead')} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen('lead')}>
        <div className="miniLabel">
          <span>By lead time</span>
          <span>
            ≤ {fmtMW(leadMax)}
            <ExpandButton onClick={() => setOpen('lead')} label="enlarge lead-time chart" />
          </span>
        </div>
        <svg className="mini" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="MAE per lead hour">
          {leads.map((l, gi) => (
            <g key={l}>
              {models.map((m, mi) => {
                const v = data.byLead[m][l - 1] ?? 0;
                const h = (v / leadMax) * innerH;
                const x0 = PAD.left + gi * groupW + (groupW - models.length * (barW + 2)) / 2 + mi * (barW + 2);
                return (
                  <rect
                    key={m}
                    x={x0}
                    y={PAD.top + innerH - h}
                    width={barW}
                    height={h}
                    rx={2}
                    fill={styleOf(m).color}
                    opacity={styleOf(m).dash ? 0.55 : 1}
                  />
                );
              })}
              <text x={PAD.left + gi * groupW + groupW / 2} y={H - 3} textAnchor="middle">
                {l} h
              </text>
            </g>
          ))}
          <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + innerH} y2={PAD.top + innerH} stroke="var(--axis)" />
        </svg>
      </div>
      <div className="miniBox" onClick={() => setOpen('month')} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen('month')}>
        <div className="miniLabel">
          <span>By month</span>
          <span>
            {fmtMW(monthMin)} – {fmtMW(monthMax)}
            <ExpandButton onClick={() => setOpen('month')} label="enlarge month chart" />
          </span>
        </div>
        <svg className="mini" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="MAE per month">
          {models.map((m, mi) => {
            const pts = monthVals[mi]
              .map((v, i) => (v == null ? null : `${xm(i).toFixed(1)},${ym(v).toFixed(1)}`))
              .filter(Boolean);
            return (
              <path
                key={m}
                d={`M${pts.join('L')}`}
                fill="none"
                stroke={styleOf(m).color}
                strokeWidth={2}
                strokeDasharray={styleOf(m).dash}
              />
            );
          })}
          <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + innerH} y2={PAD.top + innerH} stroke="var(--axis)" />
          {months
            .filter((mo) => mo % 2 === 1)
            .map((mo) => (
              <text key={mo} x={xm(mo - 1)} y={H - 3} textAnchor={mo === 1 ? 'start' : mo === 11 ? 'end' : 'middle'}>
                {monthShort(mo)}
              </text>
            ))}
        </svg>
      </div>
      {open === 'lead' && (
        <Modal
          title="MAE by lead time"
          subtitle={`Mean absolute error for every forecast hour 1 … ${data.meta.horizon} over all ${data.meta.cutoffs} weeks, visible models only. Vertical grid = one day.`}
          onClose={() => setOpen(null)}
          wide
        >
          <LeadChart data={data} visible={visible} />
        </Modal>
      )}
      {open === 'month' && (
        <Modal
          title="MAE by month"
          subtitle="Mean absolute error of all forecast hours that fall into the calendar month, over the whole test period (Aug 2016 – Jul 2018)."
          onClose={() => setOpen(null)}
          wide
        >
          <MonthChart data={data} visible={visible} />
        </Modal>
      )}
    </div>
  );
}
